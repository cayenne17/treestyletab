/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  log as internalLogger,
  countMatched,
  configs,
  isMacOS,
} from '/common/common.js';
import * as Constants from '/common/constants.js';
import * as SidebarTabs from './sidebar-tabs.js';
import * as Size from './size.js';

import { kTAB_CLOSE_BOX_ELEMENT_NAME } from './components/TabCloseBoxElement.js';
import { kTAB_SOUND_BUTTON_ELEMENT_NAME } from './components/TabSoundButtonElement.js';
import { kTAB_TWISTY_ELEMENT_NAME } from './components/TabTwistyElement.js';

// eslint-disable-next-line no-unused-vars
function log(...args) {
  internalLogger('sidebar/event-utils', ...args);
}

let mTargetWindow;

export function setTargetWindowId(windowId) {
  mTargetWindow = windowId;
}


export function isMiddleClick(event) {
  return event.button == 1;
}

export function isAccelAction(event) {
  return isMiddleClick(event) || (event.button == 0 && isAccelKeyPressed(event));
}

export function isAccelKeyPressed(event) {
  return isMacOS() ?
    (event.metaKey || event.key == 'Meta') :
    (event.ctrlKey || event.key == 'Control') ;
}

export function isCopyAction(event) {
  return isAccelKeyPressed(event) ||
           (event.dataTransfer && event.dataTransfer.dropEffect == 'copy');
}

export function getElementTarget(eventOrTarget) {
  const target = eventOrTarget instanceof Node ?
    eventOrTarget :
    eventOrTarget.target;
  if (target.nodeType == Node.TEXT_NODE)
    return target.parentNode;
  return target instanceof Element ? target : null;
}

export function getElementOriginalTarget(eventOrTarget) {
  const target = eventOrTarget instanceof Node ?
    eventOrTarget :
    (event => {
      try {
        if (event.originalTarget &&
            event.originalTarget.nodeType)
          return event.originalTarget;
      }
      catch(_error) {
        // Access to the origianlTarget can be restricted on some cases,
        // ex. mousedown in extra contents of the new tab button. Why?
      }
      return event.explicitOriginalTarget || eventOrTarget.target;
    })(eventOrTarget);
  if (target.nodeType == Node.TEXT_NODE)
    return target.parentNode;
  return target instanceof Element ? target : null;
}

export function isEventFiredOnTwisty(event) {
  const tab = getTabFromEvent(event);
  if (!tab || !tab.$TST.hasChild)
    return false;

  const target = getElementTarget(event);
  return target && target.closest && !!target.closest(kTAB_TWISTY_ELEMENT_NAME);
}

export function isEventFiredOnSoundButton(event) {
  const target = getElementTarget(event);
  return target && target.closest && !!target.closest(kTAB_SOUND_BUTTON_ELEMENT_NAME);
}

export function isEventFiredOnClosebox(event) {
  const target = getElementTarget(event);
  return target && target.closest && !!target.closest(kTAB_CLOSE_BOX_ELEMENT_NAME);
}

export function isEventFiredOnNewTabButton(event) {
  const target = getElementTarget(event);
  return target && target.closest && !!target.closest(`.${Constants.kNEWTAB_BUTTON}`);
}

export function isEventFiredOnMenuOrPanel(event) {
  const target = getElementTarget(event);
  return target && target.closest && !!target.closest('ul.menu, ul.panel');
}

export function isEventFiredOnAnchor(event) {
  const target = getElementTarget(event);
  return target && target.closest && !!target.closest(`[data-menu-ui]`);
}

export function isEventFiredOnClickable(event) {
  const target = getElementTarget(event);
  return target && target.closest && !!target.closest(`button, scrollbar, select`);
}

export function isEventFiredOnTabbarTop(event) {
  const target = getElementTarget(event);
  return target && target.closest && !!target.closest('#tabbar-top');
}

export function isEventFiredOnTabbarBottom(event) {
  const target = getElementTarget(event);
  return target && target.closest && !!target.closest('#tabbar-bottom');
}


export function getTabFromEvent(event, options = {}) {
  return SidebarTabs.getTabFromDOMNode(event.target, options);
}

function getTabbarFromEvent(event) {
  let node = event.target;
  if (!node)
    return null;
  if (!(node instanceof Element))
    node = node.parentNode;
  return node && node.closest('.tabs');
}

export function getTabFromTabbarEvent(event, options = {}) {
  if (!configs.shouldDetectClickOnIndentSpaces ||
      isEventFiredOnClickable(event))
    return null;
  return getTabFromCoordinates(event, options);
}

function getTabFromCoordinates(event, options = {}) {
  const tab = SidebarTabs.getTabFromDOMNode(document.elementFromPoint(event.clientX, event.clientY), options);
  if (tab)
    return tab;

  const container = getTabbarFromEvent(event);
  if (!container)
    return null;

  // because tab style can be modified, we try to find tab from
  // left, middle, and right.
  const containerRect = container.getBoundingClientRect();
  const trialPoints = [
    Size.getFavIconSize(),
    containerRect.width / 2,
    containerRect.width - Size.getFavIconSize()
  ];
  for (const x of trialPoints) {
    const tab = SidebarTabs.getTabFromDOMNode(document.elementFromPoint(x, event.clientY), options);
    if (tab)
      return tab;
  }

  // document.elementFromPoint cannot find elements being in animation effect,
  // so I try to find a tab from previous or next tab.
  const height = Size.getTabHeight();
  for (const x of trialPoints) {
    let tab = SidebarTabs.getTabFromDOMNode(document.elementFromPoint(x, event.clientY - height), options);
    tab = SidebarTabs.getTabFromDOMNode(tab && tab.$TST.element.nextSibling, options);
    if (tab)
      return tab;
  }
  for (const x of trialPoints) {
    let tab = SidebarTabs.getTabFromDOMNode(document.elementFromPoint(x, event.clientY + height), options);
    tab = SidebarTabs.getTabFromDOMNode(tab && tab.$TST.element.previousSibling, options);
    if (tab)
      return tab;
  }

  return null;
}


const lastMousedown = new Map();

export function getLastMousedown(button) {
  return lastMousedown.get(button);
}

export function setLastMousedown(button, details) {
  lastMousedown.set(button, details);
}

export function cancelHandleMousedown(button = null) {
  if (!button && button !== 0) {
    return countMatched(Array.from(lastMousedown.keys()),
                        button => cancelHandleMousedown(button)) > 0;
  }

  const lastMousedownForButton = lastMousedown.get(button);
  if (lastMousedownForButton) {
    clearTimeout(lastMousedownForButton.timeout);
    lastMousedown.delete(button);
    return true;
  }
  return false;
}


export function getEventDetail(event) {
  return {
    targetType: getEventTargetType(event),
    window:     mTargetWindow,
    windowId:   mTargetWindow,
    ctrlKey:    event.ctrlKey,
    shiftKey:   event.shiftKey,
    altKey:     event.altKey,
    metaKey:    event.metaKey,
  };
}

export function getTabEventDetail(event, tab) {
  return {
    ...getEventDetail(event),
    tab:   tab && tab.id,
    tabId: tab && tab.id,
  };
}

export function getMouseEventDetail(event, tab) {
  return {
    ...getTabEventDetail(event, tab),
    twisty:        isEventFiredOnTwisty(event),
    soundButton:   isEventFiredOnSoundButton(event),
    closebox:      isEventFiredOnClosebox(event),
    button:        event.button,
    isMiddleClick: isMiddleClick(event),
    isAccelClick:  isAccelAction(event),
    lastInnerScreenY: window.mozInnerScreenY,
  };
}

export function getEventTargetType(event) {
  if (event.target.closest('.rich-confirm, #blocking-screen'))
    return 'outside';

  if (getTabFromEvent(event))
    return 'tab';

  if (isEventFiredOnNewTabButton(event))
    return 'newtabbutton';

  if (isEventFiredOnMenuOrPanel(event) ||
      isEventFiredOnAnchor(event))
    return 'selector';

  if (isEventFiredOnTabbarTop(event))
    return 'tabbar-top';
  if (isEventFiredOnTabbarBottom(event))
    return 'tabbar-bottom';

  const allRange = document.createRange();
  allRange.selectNodeContents(document.body);
  const containerRect = allRange.getBoundingClientRect();
  allRange.detach();
  if (event.clientX < containerRect.left ||
      event.clientX > containerRect.right ||
      event.clientY < containerRect.top ||
      event.clientY > containerRect.bottom)
    return 'outside';

  return 'blank';
}


export function wrapWithErrorHandler(func) {
  return (...args) => {
    try {
      const result = func(...args);
      if (result && result instanceof Promise)
        return result.catch(e => {
          console.log('Fatal async error: ', e);
          throw e;
        });
      else
        return result;
    }
    catch(e) {
      console.log('Fatal error: ', e);
      throw e;
    }
  };
}
