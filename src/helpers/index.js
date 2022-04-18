import { Actions, Manager, Notifications } from '@twilio/flex-ui';

import { FlexNotification } from '../enums';

const manager = Manager.getInstance();

const sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

const getInputDeviceIds = async () => {
  const retryDelayMs = 250;
  const maxWaitTime = 5000;
  let totalWaitTime = 0;
  let inputDeviceIds;
  
  while (totalWaitTime < maxWaitTime) {
    const availableInputDevices = manager.voiceClient?.audio?.availableInputDevices?.keys();
    inputDeviceIds = (availableInputDevices && Array.from(availableInputDevices)) || [];

    if (inputDeviceIds.length === 0 ||
      inputDeviceIds.length === 1 && inputDeviceIds[0] === '') {
      // Still waiting for manager.voiceClient to populate input devices
      await sleep(retryDelayMs);
    } else {
      // Input devices populated
      break;
    }

    totalWaitTime += retryDelayMs;
  }
  
  return inputDeviceIds;
}

export const checkInputDevice = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());

    const inputDeviceIds = await getInputDeviceIds();

    if (inputDeviceIds.length > 0) {
      console.log('AutoAnswerCallPlugin: microphone found');
    } else {
      throw new Error('No microphone found in available input devices');
    }
  } catch (error) {
    console.error('AutoAnswerCallPlugin: error in getUserMedia.', error);
    Notifications.showNotification(FlexNotification.inputDeviceError, { error });
    throw error;
  }
}

export const handleInputDeviceError = (reservation) => {
  const activities = manager.workerClient?.activities || new Map();

  const audioDeviceErrorActivitySid = manager.serviceConfiguration
    ?.ui_attributes
    ?.audioDeviceCheckPlugin
    ?.audioDeviceErrorActivitySid;
  const audioDeviceErrorActivity = activities.get(audioDeviceErrorActivitySid);
  
  const offlineActivitySid = manager.serviceConfiguration?.taskrouter_offline_activity_sid;
  const offlineActivity = activities.get(offlineActivitySid);

  const currentWorkerActivity = manager.workerClient?.activity || {};

  if (audioDeviceErrorActivitySid) {
    console.warn(`Setting worker to ${audioDeviceErrorActivity ? audioDeviceErrorActivity.name : audioDeviceErrorActivitySid}`,
      'due to audio input device error');
    
    Actions.invokeAction('SetActivity', { activitySid: audioDeviceErrorActivitySid });
  } else if (currentWorkerActivity.available && offlineActivitySid) {
    console.warn('AutoAnswerCallPlugin: audioDeviceErrorActivitySid not defined. Setting worker to',
      `${offlineActivity ? offlineActivity.name : offlineActivitySid} instead`,
      'to prevent new reservations while input device error is present');

    Actions.invokeAction('SetActivity', { activitySid: offlineActivitySid });
  } else if (currentWorkerActivity.available) {
    // This is only for edge case handling since it would be unusual for the Flex
    // configuration to be missing "taskrouter_offline_activity_sid"
    console.warn('AutoAnswerCallPlugin: Neither audioDeviceErrorActivitySid or offlineActivitySid defined.',
      'Unable to change worker activity to prevent new reservations while input device error is present');
    
    if (reservation) {
      // Only invoking reservation reject at this point since the above "SetActivity"
      // actions automatically reject any pending reservations. Without an activity
      // to change the worker to, the reservation must be explicitly rejected.
      reservation.reject();
    }
  }
}

export const isWorkerVoiceEnabled = () => {
  const workerChannels = manager.workerClient?.channels || new Map();

  const voiceChannel = Array.from(workerChannels.values()).find(c => c.taskChannelUniqueName === 'voice');
  
  return voiceChannel ? voiceChannel.available : false;
}

export const isAudioDeviceCheckEnabled = () => {
  const isDeviceCheckEnabled = manager.serviceConfiguration
    ?.ui_attributes
    ?.audioDeviceCheckPlugin
    ?.isDeviceCheckEnabled;

  return isDeviceCheckEnabled ? true : false;
}
