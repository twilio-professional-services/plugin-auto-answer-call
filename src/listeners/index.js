import {
  Actions,
  AudioPlayerManager,
  Manager,
  Notifications,
  TaskHelper
} from '@twilio/flex-ui';

import {
  checkInputDevicePermission,
  checkMicrophoneID,
  handleInputDeviceError,
  isAudioDeviceCheckEnabled,
  isAudioDeviceWorkaroundEnabled,
  isWorkerVoiceEnabled,
  validateInputDevice
} from '../helpers';

const manager = Manager.getInstance();

const handleNewReservation = async (reservation) => {
  const task = TaskHelper.getTaskByTaskSid(reservation.sid);

  if (TaskHelper.isCallTask(task) && isAudioDeviceCheckEnabled) {
    try {
      await checkInputDevicePermission();
      if (isAudioDeviceWorkaroundEnabled) {
        await validateInputDevice();
      } else {
        checkMicrophoneID();
      }
    } catch (error) {
      console.error('AutoAnswerCallPlugin: Input device check failed. Rejecting reservation.');

      handleInputDeviceError(error, reservation);
      return;
    }
  }
  
  // Only auto accept if it's not an outbound call from Flex
  if (!TaskHelper.isInitialOutboundAttemptTask(task)) {
    Actions.invokeAction('AcceptTask', { sid: reservation.sid, isAutoAccept: true });
  }
}

export const createListeners = () => {
  manager.events.addListener('pluginsLoaded', () => {
    manager.workerClient.reservations.forEach(reservation => {
      if (reservation.status === 'pending') {
        handleNewReservation(reservation);
      }
    });
  });

  manager.workerClient.on('reservationCreated', (reservation) => {
    handleNewReservation(reservation);
  });

  Actions.addListener('afterAcceptTask', (payload) => {
    // Only executing this code if the task was auto accepted by a plugin,
    // indicated by that plugin passing "isAutoAccept: true" in the payload
    if (payload.isAutoAccept) {
      Actions.invokeAction('SelectTask', { sid: payload.sid });
      
      const announceMediaUrl = manager.serviceConfiguration?.ui_attributes?.annouceMedia;
      AudioPlayerManager.play({
        url: announceMediaUrl || process.env.REACT_APP_ANNOUNCE_MEDIA,
        repeatable: false,
      });
    }
  });

  Actions.addListener('beforeSetActivity', async (payload, abortOriginal) => {
    if (!payload.activityAvailable) {
      // No need to perform audio check if not attempting to change to an available activity
      return;
    } else if (!isWorkerVoiceEnabled() || !isAudioDeviceCheckEnabled) {
      // No need to perform audio check if worker's voice task channel isn't enabled
      // or audio device check is not enabled in the Flex configuration
      return;
    }

    try {
      await checkInputDevicePermission();
      if (isAudioDeviceWorkaroundEnabled) {
        await validateInputDevice();
      } else {
        checkMicrophoneID();
      }
    } catch (error) {
      // If input device check fails, prevent changing to an available activity
      console.error('AutoAnswerCallPlugin: Input device check failed. Preventing activity change');
      abortOriginal();

      handleInputDeviceError(error);
    }
  });

  Actions.addListener('beforeStartOutboundCall', async (payload, abortOriginal) => {
    if (!isAudioDeviceCheckEnabled) {
      // Not performing audio device check if it's not enabled in Flex configuration
      return;
    }

    try {
      await checkInputDevicePermission();
      if (isAudioDeviceWorkaroundEnabled) {
        await validateInputDevice();
      } else {
        checkMicrophoneID();
      }
    } catch (error) {      
      if (manager.serviceConfiguration?.ui_attributes?.activityHandlerPlugin) {
        console.error('AutoAnswerCallPlugin: Input device check failed.', error);
        // The plugin-activity-handler logic will set the worker to the configured
        // "On a Task" activity in its beforeStartOutbound call listener, risking
        // the agent staying in that activity if the audio device check fails and
        // this plugin aborts the StartOutboundCall action. So if this account
        // is also using plugin-activity-handler, the audio device check will not
        // be performed on StartOutboundCall. Instead, if the outbound call fails
        // due to an input device error, it will be handled in the beforeAddNotification
        // event listener
        return;
      } else {
        console.error('AutoAnswerCallPlugin: Input device check failed. Preventing outbound call');
        abortOriginal();
  
        handleInputDeviceError(error);
      }
    }
  });

  if (manager.serviceConfiguration?.ui_attributes?.activityHandlerPlugin) {
    // See note in beforeStartOutboundCall listener for more information on this
    // check if the account is also using plugin-activity-handler

    Notifications.addListener('beforeAddNotification', payload => {
      if (!isAudioDeviceCheckEnabled) {
        // Not handling input device error if it's not enabled in Flex configuration
        return;
      }

      if (payload.id === 'NoInputDevice') {
        handleInputDeviceError();
      }
    });
  }
}
