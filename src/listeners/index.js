import {
  Actions,
  AudioPlayerManager,
  Manager,
  TaskHelper
} from '@twilio/flex-ui';

import {
  checkInputDevice,
  handleInputDeviceError,
  isAudioDeviceCheckEnabled,
  isWorkerVoiceEnabled
} from '../helpers';

const manager = Manager.getInstance();

export const createListeners = () => {
  manager.workerClient.on('reservationCreated', async (reservation) => {
    const task = TaskHelper.getTaskByTaskSid(reservation.sid);

    if (TaskHelper.isCallTask(task) && isAudioDeviceCheckEnabled()) {
      try {
        await checkInputDevice();
      } catch (error) {
        console.error('AutoAnswerCallPlugin: Microphone check failed. Rejecting reservation.');

        handleInputDeviceError();
        return;
      }
    }
    
    // Only auto accept if it's not an outbound call from Flex
    if (!TaskHelper.isInitialOutboundAttemptTask(task)) {
      Actions.invokeAction('AcceptTask', { sid: reservation.sid, isAutoAccept: true });
    }
  });

  Actions.addListener('afterAcceptTask', (payload) => {
    // Only executing this code if the task was auto accepted by a plugin,
    // indicated by that plugin passing "isAutoAccept: true" in the payload
    if (payload.isAutoAccept) {
      Actions.invokeAction('SelectTask', { sid: payload.sid });
      AudioPlayerManager.play({
        url: process.env.REACT_APP_ANNOUNCE_MEDIA,
        repeatable: false,
      });
    }
  });

  Actions.addListener('beforeSetActivity', async (payload, abortOriginal) => {
    if (!payload.activityAvailable) {
      // No need to perform audio check if not attempting to change to an available activity
      return;
    } else if (!isWorkerVoiceEnabled() || !isAudioDeviceCheckEnabled()) {
      // No need to perform audio check if worker's voice task channel isn't enabled
      // or audio device check is not enabled in the Flex configuration
      return;
    }

    try {
      await checkInputDevice();
      console.log('AudioDeviceCheckPlugin: Microphone check passed. Allowing activity change.');
    } catch (error) {
      // If input device check fails, prevent changing to an available activity
      console.error('AudioDeviceCheckPlugin: Microphone check failed. Preventing activity change.');
      abortOriginal();

      handleInputDeviceError();
    }
  });
}
