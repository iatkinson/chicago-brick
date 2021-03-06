/* Copyright 2015 Google Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

'use strict';

const stateMachine = require('lib/state_machine');
const time = require('server/util/time');
const wallGeometry = require('server/util/wall_geometry');

const debug = require('debug')('wall:client_control_state_machine');
const logError = require('server/util/log').error(debug);
const monitor = require('server/monitoring/monitor');

class ClientControlStateMachine extends stateMachine.Machine {
  constructor(client) {
    super(new IdleState, debug);

    // Assign client socket to context so that states can communicate with the
    // client.
    this.setContext({client});
  }
  nextModule(moduleDef, deadline, geo) {
    this.state.nextModule(moduleDef, deadline, geo);
  }
  handleError(error) {
    logError(error);
    // It's unexpected that we'll ever get into an error state here. If we do, we transition immediately to Idle and await further instructions.
    this.transitionTo(new IdleState);
    // Re-enable the state machine.
    this.driveMachine();
  }
  getModuleName() {
    return this.state.getModuleName();
  }
  getClientInfo() {
    return this.context_.client;
  }
  stop(deadline) {
    this.transitionTo(new IdleState);
    this.context_.client.socket.emit('stop', {deadline});
  }
}

class IdleState extends stateMachine.State {
  enter(transition) {
    this.transition_ = transition;
  }
  nextModule(moduleDef, deadline, geo) {
    this.transition_(new PrepareState(moduleDef, deadline, geo));
  }
  getModuleName() {
    return '<None>';
  }
}

class PrepareState extends stateMachine.State {
  constructor(moduleDef, deadline, geo) {
    super();

    // Server-side module info.
    this.moduleDef_ = moduleDef;

    // The deadline at which we should transition to the new module.
    this.deadline_ = deadline;
    
    // The geometry of the wall.
    this.geo_ = geo;
    
    this.timer_ = null;
  }
  enter(transition, context) {
    this.transition_ = transition;
    let client = context.client;
    
    // Tell the client to load the relevant module.
    client.socket.emit('loadModule', {
      module: this.moduleDef_.serializeForClient(),
      time: this.deadline_,
      geo: this.geo_.points
    });

    this.timer_ = setTimeout(() => {
      transition(new DisplayState(this.moduleDef_));
    }, time.until(this.deadline_));
  }
  exit() {
    clearTimeout(this.timer_);
  }
  nextModule(moduleDef, deadline, geo) {
    // Even if waiting for the client to do something, prepare a new module
    // immediately.
    this.transition_(new PrepareState(moduleDef, deadline, geo));
  }
  getModuleName() {
    return this.moduleDef_.name;
  }
}

class DisplayState extends stateMachine.State {
  constructor(moduleDef) {
    super();
    this.moduleDef_ = moduleDef;
  }
  enter(transition) {
    this.transition_ = transition;
  }
  nextModule(moduleDef, deadline, geo) {
    this.transition_(new PrepareState(moduleDef, deadline, geo));
  }
  getModuleName() {
    return this.moduleDef_.name;
  }
}

module.exports = ClientControlStateMachine;
