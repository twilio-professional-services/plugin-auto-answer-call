import React from 'react';
import { VERSION } from '@twilio/flex-ui';
import { FlexPlugin } from 'flex-plugin';

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
    manager.workerClient.on('reservationCreated', (reservation) => {
      flex.Actions.invokeAction('AcceptTask', { sid: reservation.sid });
    });

    flex.Actions.addListener('afterAcceptTask', (payload) => {
      flex.Actions.invokeAction('SelectTask', { sid: payload.sid });
      flex.AudioPlayerManager.play({
        url: process.env.REACT_APP_ANNOUNCE_MEDIA,
        repeatable: false,
      });
    });

  }
}
