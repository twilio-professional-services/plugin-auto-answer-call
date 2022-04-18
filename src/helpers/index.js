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
  
  console.debug('AudioDeviceCheckPlugin: getInputDeviceIds totalWaitTime:', totalWaitTime);
  return inputDeviceIds;
}

export const checkInputDevice = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.debug('AudioDeviceCheckPlugin: getUserMedia stream:', stream);
    stream.getTracks().forEach(track => track.stop());

    const inputDeviceIds = await getInputDeviceIds();
    console.debug('AudioDeviceCheckPlugin: inputDeviceIds:', inputDeviceIds);

    if (inputDeviceIds.length > 0) {
      console.log('AudioDeviceCheckPlugin: microphone found');
    } else {
      throw new Error('No microphone found in available input devices');
    }
  } catch (error) {
    console.error('AudioDeviceCheckPlugin: error in getUserMedia.', error);
    Notifications.showNotification(FlexNotification.inputDeviceError, { error });
    throw error;
  }
}

export const handleInputDeviceError = () => {
  const audioDeviceErrorActivitySid = manager.serviceConfiguration
    ?.ui_attributes
    ?.audioDeviceCheckPlugin
    ?.audioDeviceErrorActivitySid;
  
  const offlineActivitySid = manager.serviceConfiguration
    ?.taskrouter_offline_activity_sid;

  if (audioDeviceErrorActivitySid) {
    Actions.invokeAction('SetActivity', { activitySid: audioDeviceErrorActivitySid });
  } else if (offlineActivitySid) {
    console.warn('AutoAnswerCallPlugin: audioDeviceErrorActivitySid not defined. Setting worker to Offline instead');
    Actions.invokeAction('SetActivity', { activitySid: offlineActivitySid });
  } else {
    console.warn('AutoAnswerCallPlugin: Neither audioDeviceErrorActivitySid or offlineActivitySid defined.',
      'Unable to change worker activity to prevent new reservations while input device error present');
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
