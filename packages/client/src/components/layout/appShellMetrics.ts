import type { DimensionValue } from 'react-native';
import { clientApplication } from '../../runtime/application';

export const WEB_APP_MAX_WIDTH = clientApplication === 'management' ? 1000 : 430;
export const WEB_VIEWPORT_HEIGHT = '100dvh' as DimensionValue;
