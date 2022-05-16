import React from 'react';
import { VERSION } from '@twilio/flex-ui';
import { FlexPlugin } from '@twilio/flex-plugin';

import { registerNotifications } from './notifications';
import { createListeners } from './listeners';
import {
  checkInputDevicePermission,
  handleInputDeviceError,
  isAudioDeviceCheckEnabled,
  isWorkerVoiceEnabled
} from './helpers';

const PLUGIN_NAME = 'FlexAutoAnswerCallPlugin';

export default class FlexAutoAnswerCallPlugin extends FlexPlugin {
  constructor() {
    super(PLUGIN_NAME);
  }

  /**
   * This code is run when your plugin is being started
   * Use this to modify any UI components or attach to the actions framework
   *
   * @param flex { typeof import('@twilio/flex-ui') }
   * @param manager { import('@twilio/flex-ui').Manager }
   */
  async init(flex, manager) {
    registerNotifications();

    createListeners();

    if (isWorkerVoiceEnabled() && isAudioDeviceCheckEnabled) {
      checkInputDevicePermission().catch(error => {
        handleInputDeviceError(error);
      });
    }
  }
}
