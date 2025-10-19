/**
 * Settings container for ORM configuration
 */

import * as _ from 'lodash';
import { SettingsContainer } from './types/Core';

const default_settings = {
  properties: {
    primary_key: "id",
    association_key: "{name}_{field}",
    required: false
  },
  instance: {
    identityCache: false,
    identityCacheSaveCheck: true,
    autoFetch: false,
    autoFetchLimit: 1,
    cascadeRemove: true,
    returnAllErrors: false,
    saveAssociationsByDefault: true,
    promiseFunctionPostfix: "Async"
  },
  connection: {
    reconnect: true,
    pool: false,
    debug: false
  }
};

export interface SettingsInterface {
  set(key: string, value: any): this;
  get(key: string, def?: any): any;
  unset(...keys: string[]): this;
}

class SettingsContainerClass implements SettingsInterface {
  public settings: any;

  constructor(settings?: any) {
    this.settings = settings || _.cloneDeep(default_settings);
  }

  set(key: string, value: any): this {
    setNested(key, value, this.settings);
    return this;
  }

  get(key: string, def?: any): any {
    let value = getNested(key, def, this.settings);

    if (typeof value === 'undefined' && typeof def === 'undefined' && key.indexOf('.') === -1) {
      for (const sectionKey of ['instance', 'properties', 'connection']) {
        const section = this.settings[sectionKey];
        if (section && Object.prototype.hasOwnProperty.call(section, key)) {
          value = section[key];
          break;
        }
      }
    }

    if (value instanceof Function) {
      return value;
    } else {
      return _.cloneDeep(value);
    }
  }

  unset(...keys: string[]): this {
    for (const key of keys) {
      if (typeof key === "string") {
        unsetNested(key, this.settings);
      }
    }
    return this;
  }
}

const Settings = {
  Container: SettingsContainerClass,
  defaults: (): SettingsContainer => _.cloneDeep(default_settings)
};

function setNested(key: string, value: any, obj: any): any {
  const p = key.indexOf(".");

  if (p === -1) {
    return obj[key] = value;
  }

  if (!obj.hasOwnProperty(key.substr(0, p))) {
    obj[key.substr(0, p)] = {};
  }

  return setNested(key.substr(p + 1), value, obj[key.substr(0, p)]);
}

function getNested(key: string, def: any, obj: any): any {
  const p = key.indexOf(".");

  if (p === -1) {
    if (key === '*') {
      return obj;
    }
    return obj.hasOwnProperty(key) ? obj[key] : def;
  }

  if (!obj.hasOwnProperty(key.substr(0, p))) {
    return def;
  }

  return getNested(key.substr(p + 1), def, obj[key.substr(0, p)]);
}

function unsetNested(key: string, obj: any): void {
  const p = key.indexOf(".");

  if (p === -1) {
    if (key === '*') {
      for (const k in obj) {
        delete obj[k];
      }
    } else {
      delete obj[key];
    }
    return;
  }

  if (!obj.hasOwnProperty(key.substr(0, p))) {
    return;
  }

  return unsetNested(key.substr(p + 1), obj[key.substr(0, p)]);
}

export default Settings;

