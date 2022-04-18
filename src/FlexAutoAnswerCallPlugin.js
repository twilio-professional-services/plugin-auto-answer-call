import React from 'react';
import { TaskHelper, VERSION } from '@twilio/flex-ui';
import { FlexPlugin } from '@twilio/flex-plugin';

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
      const task = TaskHelper.getTaskByTaskSid(reservation.sid);
      
      // Only auto accept if it's not an outbound call from Flex
      if (!TaskHelper.isInitialOutboundAttemptTask(task)) {
        flex.Actions.invokeAction('AcceptTask', { sid: reservation.sid, isAutoAccept: true });
      }
    });

    flex.Actions.addListener('afterAcceptTask', (payload) => {
      // Only executing this code if the task was auto accepted by a plugin,
      // indicated by that plugin passing "isAutoAccept: true" in the payload
      if (payload.isAutoAccept) {
        flex.Actions.invokeAction('SelectTask', { sid: payload.sid });
        flex.AudioPlayerManager.play({
          url: process.env.REACT_APP_ANNOUNCE_MEDIA,
          repeatable: false,
        });
      }
    });

  }
}
