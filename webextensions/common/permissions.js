/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  log as internalLogger,
  notify,
  configs
} from './common.js';
import * as ApiTabs from '/common/api-tabs.js';
import * as Constants from './constants.js';

function log(...args) {
  internalLogger('common/permissions', ...args);
}

export const BOOKMARKS = { permissions: ['bookmarks'] };
export const ALL_URLS = { origins: ['<all_urls>'] };
export const TAB_HIDE = { permissions: ['tabHide'] };

const checkboxesForPermission = new Map();

export function clearRequest() {
  configs.requestingPermissions = null;
}

export function isGranted(permissions) {
  try {
    return browser.permissions.contains(permissions).catch(ApiTabs.createErrorHandler());
  }
  catch(_e) {
    return Promise.reject(new Error('unsupported permission'));
  }
}

export function bindToCheckbox(permissions, checkbox, options = {}) {
  const checkboxes = checkboxesForPermission.get(permissions) || [];
  checkboxes.push(checkbox);
  checkboxesForPermission.set(permissions, checkboxes);

  isGranted(permissions)
    .then(granted => {
      checkbox.checked = granted;
    })
    .catch(_error => {
      checkbox.setAttribute('readonly', true);
      checkbox.setAttribute('disabled', true);
      const label = checkbox.closest('label') || document.querySelector(`label[for=${checkbox.id}]`);
      if (label)
        label.setAttribute('disabled', true);
    });

  checkbox.addEventListener('change', _event => {
    checkbox.requestPermissions()
  });

  browser.runtime.onMessage.addListener((message, _sender) => {
    if (!message ||
        !message.type ||
        message.type != Constants.kCOMMAND_NOTIFY_PERMISSIONS_GRANTED ||
        JSON.stringify(message.permissions) != JSON.stringify(permissions))
      return;
    if (options.onChanged)
      options.onChanged(true);
    checkbox.checked = true;
  });

  /*
  // These events are not available yet on Firefox...
  browser.permissions.onAdded.addListener(addedPermissions => {
    if (addedPermissions.permissions.includes('...'))
      checkbox.checked = true;
  });
  browser.permissions.onRemoved.addListener(removedPermissions => {
    if (removedPermissions.permissions.includes('...'))
      checkbox.checked = false;
  });
  */

  checkbox.requestPermissions = async () => {
    const checkboxes = checkboxesForPermission.get(permissions);
    try {
      if (!checkbox.checked) {
        await browser.permissions.remove(permissions).catch(ApiTabs.createErrorSuppressor());
        for (const checkbox of checkboxes) {
          checkbox.checked = false;
        }
        if (options.onChanged)
          options.onChanged(false);
        return;
      }

      for (const checkbox of checkboxes) {
        checkbox.checked = false;
      }

      if (configs.requestingPermissionsNatively)
        return;

      configs.requestingPermissionsNatively = permissions;
      let granted = await browser.permissions.request(permissions).catch(ApiTabs.createErrorHandler());
      configs.requestingPermissionsNatively = null;

      if (granted === undefined)
        granted = await isGranted(permissions);
      else if (!granted)
        return;

      if (granted) {
        for (const checkbox of checkboxes) {
          checkbox.checked = true;
        }
        if (options.onChanged)
          options.onChanged(true);
        browser.runtime.sendMessage({
          type: Constants.kCOMMAND_NOTIFY_PERMISSIONS_GRANTED,
          permissions
        }).catch(_error => {});
        return;
      }

      configs.requestingPermissions = permissions;
      browser.browserAction.setBadgeText({ text: '!' });
      browser.browserAction.setPopup({ popup: '' });

      notify({
        title:   browser.i18n.getMessage('config_requestPermissions_fallbackToToolbarButton_title'),
        message: browser.i18n.getMessage('config_requestPermissions_fallbackToToolbarButton_message'),
        icon:    'resources/24x24.svg#default'
      });
      return;
    }
    catch(error) {
      console.log(error);
    }
    for (const checkbox of checkboxes) {
      checkbox.checked = false;
    }
  };
}

export function bindToClickable(permissions, node, { onChanged } = {}) {
  node.addEventListener('click', _event => {
    node.requestPermissions()
  });

  if (node.requestPermissions)
    return;

  node.requestPermissions = async () => {
    try {
      const checkboxes = checkboxesForPermission.get(permissions);
      if (configs.requestingPermissionsNatively ||
          checkboxes.every(checkbox => checkbox.checked))
        return;

      configs.requestingPermissionsNatively = permissions;
      // We need to call this without delay to avoid "permissions.request may only be called from a user input handler" error.
      let granted = await browser.permissions.request(permissions).catch(ApiTabs.createErrorHandler());
      configs.requestingPermissionsNatively = null;

      if (granted === undefined)
        granted = await isGranted(permissions);
      else if (!granted)
        return;

      if (granted) {
        for (const checkbox of checkboxes) {
          checkbox.checked = true;
        }
        if (onChanged)
          onChanged(true);
        browser.runtime.sendMessage({
          type: Constants.kCOMMAND_NOTIFY_PERMISSIONS_GRANTED,
          permissions
        }).catch(_error => {});
        return;
      }

      configs.requestingPermissions = permissions;
      browser.browserAction.setBadgeText({ text: '!' });
      browser.browserAction.setPopup({ popup: '' });

      notify({
        title:   browser.i18n.getMessage('config_requestPermissions_fallbackToToolbarButton_title'),
        message: browser.i18n.getMessage('config_requestPermissions_fallbackToToolbarButton_message'),
        icon:    'resources/24x24.svg#default'
      });
      return;
    }
    catch(error) {
      console.log(error);
    }
  };
}

export function requestPostProcess() {
  if (!configs.requestingPermissions)
    return false;

  const permissions = configs.requestingPermissions;
  configs.requestingPermissions = null;
  configs.requestingPermissionsNatively = permissions;

  browser.browserAction.setBadgeText({ text: '' });
  browser.permissions.request(permissions)
    .then(granted => {
      log('permission requested: ', permissions, granted);
      if (granted)
        browser.runtime.sendMessage({
          type: Constants.kCOMMAND_NOTIFY_PERMISSIONS_GRANTED,
          permissions
        }).catch(_error => {});
    })
    .catch(ApiTabs.createErrorSuppressor())
    .finally(() => {
      configs.requestingPermissionsNatively = null;
    });
  return true;
}

configs.$loaded.then(() => {
  configs.requestingPermissionsNatively = null;
});
