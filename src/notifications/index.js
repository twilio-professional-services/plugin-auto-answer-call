
import { Manager, Notifications, NotificationType } from '@twilio/flex-ui';

import { FlexNotification } from '../enums';

const manager = Manager.getInstance();

export const registerNotifications = () => {
  manager.strings[FlexNotification.inputDeviceError] = (
    "There is a problem with your microphone. Please resolve before changing to Available. [{{error}}]"
  );

  Notifications.registerNotification({
    id: FlexNotification.inputDeviceError,
    closeButton: true,
    content: FlexNotification.inputDeviceError,
    timeout: 0,
    type: NotificationType.error
  });
}
