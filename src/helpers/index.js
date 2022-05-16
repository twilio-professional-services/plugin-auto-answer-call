import { Actions, Manager, Notifications } from '@twilio/flex-ui';

import { FlexNotification } from '../enums';

const manager = Manager.getInstance();

export const checkInputDevicePermission = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());

    console.log('AutoAnswerCallPlugin: input device permissions check passed');
  } catch (error) {
    console.error('AutoAnswerCallPlugin: error in getUserMedia.', error);
    throw error;
  }
}

export const checkMicrophoneID = () => {
  const state = manager.store.getState()?.flex;

  // These if conditionals mirror native Flex UI logic executed 
  // when a new incoming voice client call is detected
  if (state?.config?.initialDeviceCheck) {
    const microphoneID = state?.phone?.listener?.microphoneID;

    if (!microphoneID) {
      console.error('AutoAnswerCallPlugin: no microphone ID found. ID value:', 
        microphoneID === '' ? '""' : microphoneID
      );

      throw new Error('No microphone ID found');
    }
  }
}

const waitForDeviceIdUpdate = (deviceId) => new Promise((resolve, reject) => {
  const maxWaitTimeMs = 2000;
  const retryDelayMs = 100;
  let totalWaitTimeMs = 0;

  const phoneState = manager.store.getState().flex?.phone?.listener;

  const deviceIdCheckInterval = setInterval(() => {
    totalWaitTimeMs += retryDelayMs;
    if (totalWaitTimeMs >= maxWaitTimeMs) {
      clearInterval(deviceIdCheckInterval);
      reject(`Timed out waiting for Microphone ID to be set to ${deviceId}`);
    } else if (phoneState?.microphoneID === deviceId) {
      clearInterval(deviceIdCheckInterval);
      resolve();
    }
  }, retryDelayMs);
});

export const validateInputDevice = async () => {
  // This function was created to workaround an issue with the voice client
  // availableInputDevices map only containing a single entry that is not
  // a valid device, but instead has an empty string for the key, which 
  // doesn't match any valid media devices. This behavior was observed in
  // Flex instances running in Microsoft Azure VDI remote desktop sessions.
  const phoneState = manager.store.getState().flex?.phone?.listener;
  const clientAudio = manager.voiceClient?.audio;

  if (!phoneState) {
    throw new Error('Flex phone state not found. Please refresh your Flex browser.');
  }
  if (!clientAudio) {
    throw new Error('Voice client audio not found. Please refresh your Flex browser.')
  }

  const defaultInputDevice = clientAudio.availableInputDevices.get('default');
  const firstInputDevice = clientAudio.availableInputDevices.get(
    clientAudio.availableInputDevices.keys()[0]
  );

  const chosenInputDevice = defaultInputDevice ? defaultInputDevice : firstInputDevice;

  if (chosenInputDevice && 
    chosenInputDevice.deviceId && 
    chosenInputDevice.deviceId === phoneState.microphoneID) {

    console.log('AutoAnswerCallPlugin: input device ready. deviceId:', chosenInputDevice.deviceId);
    return;
  }

  // Looking for a valid media device only if the above input device check failed
  console.warn('AutoAnswerCallPlugin: missing input device, attempting to repair');
  const devices = await navigator.mediaDevices.enumerateDevices();
  const defaultMediaDevice = Array.isArray(devices) && devices.find(d => d.deviceId === 'default');
  const firstMediaDevice = Array.isArray(devices) && devices[0];

  const chosenMediaDevice = defaultMediaDevice ? defaultMediaDevice : firstMediaDevice;

  if (chosenMediaDevice && chosenMediaDevice.deviceId) {
    clientAudio.availableInputDevices.set(chosenMediaDevice.deviceId, chosenMediaDevice);
    phoneState.handleDeviceChange();
    await waitForDeviceIdUpdate(chosenMediaDevice.deviceId);
    console.log('AutoAnswerCallPlugin: input device ready. deviceId:', chosenMediaDevice.deviceId);
  } else {
    throw new Error('No microphone found in available media devices');
  }
}

export const handleInputDeviceError = (error, reservation) => {
  if (error) {
    Notifications.showNotification(FlexNotification.inputDeviceError, { error });
  }

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
    
    // Setting "isInvokedByPlugin: true" for interoperability with plugin-activity-handler, found at
    // https://github.com/twilio-professional-services/plugin-activity-handler
    Actions.invokeAction('SetActivity', { activitySid: audioDeviceErrorActivitySid, isInvokedByPlugin: true });
  } else if (currentWorkerActivity.available && offlineActivitySid) {
    console.warn('AutoAnswerCallPlugin: audioDeviceErrorActivitySid not defined. Setting worker to',
      `${offlineActivity ? offlineActivity.name : offlineActivitySid} instead`,
      'to prevent new reservations while input device error is present');

    // Setting "isInvokedByPlugin: true" for interoperability with plugin-activity-handler, found at
    // https://github.com/twilio-professional-services/plugin-activity-handler
    Actions.invokeAction('SetActivity', { activitySid: offlineActivitySid, isInvokedByPlugin: true });
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

const audioDeviceCheckPluginConfig = (
  manager.serviceConfiguration
    ?.ui_attributes
    ?.audioDeviceCheckPlugin
);

export const isAudioDeviceCheckEnabled = (
  audioDeviceCheckPluginConfig?.isDeviceCheckEnabled === true ? true : false
);

export const isAudioDeviceWorkaroundEnabled = (
  audioDeviceCheckPluginConfig?.isWorkaroundEnabled === true ? true : false
);
