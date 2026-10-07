import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '@/services';
import type { CreateRoadReportInput, RoadReport, RoadReportBounds } from '@/types';
import { queryKeys } from './queryKeys';
import { cachedRead } from '@/offline/storage';
import { retryQueue, newQueueKey } from '@/offline/retryQueue';
import { useUserId } from './useSession';
import { AppError } from '@/utils/errors';

export function useRoadReports(bounds: RoadReportBounds) {
  const userId = useUserId();
  return useQuery({
    queryKey: queryKeys.roadReports(bounds),
    queryFn: () => userId ? cachedRead(userId, `roadReports.${JSON.stringify(bounds)}`, () => services.roadReports.list(bounds)) : services.roadReports.list(bounds),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useCreateRoadReport() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateRoadReportInput) => {
      try { return await services.roadReports.create(input); }
      catch (error) {
        if (!userId || !(error instanceof AppError) || error.code !== 'network') throw error;
        await retryQueue.enqueue({ userId, createdAt: new Date().toISOString(), idempotencyKey: newQueueKey('road-report'), mutation: { kind: 'road-report', payload: input } });
        throw new AppError('network', 'Saved to send when online.', { queued: true });
      }
    },
    onSuccess: (result) => {
      const report = result.report;
      queryClient.setQueryData(queryKeys.roadReport(report.id), report);
      queryClient.setQueriesData<RoadReport[]>({ queryKey: queryKeys.roadReportLists() }, (current) =>
        current?.map((item) => item.id === report.id ? report : item),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.roadReportLists() });
    },
  });
}

function useVote(reportId: string | undefined, kind: 'confirm' | 'reject', action: (reportId: string) => Promise<RoadReport>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['road-report-vote', reportId ?? 'none', kind],
    mutationFn: () => {
      if (!reportId) throw new Error('A report must be selected before voting');
      return action(reportId);
    },
    onSuccess: (report) => {
      queryClient.setQueryData(queryKeys.roadReport(report.id), report);
      queryClient.setQueriesData<RoadReport[]>({ queryKey: queryKeys.roadReportLists() }, (current) =>
        current?.map((item) => item.id === report.id ? report : item),
      );
    },
  });
}

export const useConfirmRoadReport = (reportId?: string) => useVote(reportId, 'confirm', services.roadReports.confirm);
export const useRejectRoadReport = (reportId?: string) => useVote(reportId, 'reject', services.roadReports.reject);
