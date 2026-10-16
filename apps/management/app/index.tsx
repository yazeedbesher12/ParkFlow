import { Redirect } from 'expo-router';
import { useAuthStore } from '@parkflow/client/store/authStore';
import { authLanding } from '@parkflow/client/utils/authFlow';

export default function ManagementIndex() {
  const user = useAuthStore(state => state.user);
  return <Redirect href={authLanding(user, 'management')} />;
}
