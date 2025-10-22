/**
 * Lazy loading utilities
 */

function ucfirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function conditionAssign(instance: Record<string, any>, model: any): Record<string, any> {
  const conditions: Record<string, any> = {};
  conditions[model.id] = instance[model.id];
  return conditions;
}

async function saveEntity(entity: any): Promise<void> {
  if (typeof entity.save !== 'function') {
    throw new Error('LazyLoad operations expect related instances to expose a save() method.');
  }

  if (entity.save.length > 0) {
    await new Promise<void>((resolve, reject) => {
      entity.save((err?: Error | null) => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
    return;
  }

  const result = entity.save();
  if (result && typeof result.then === 'function') {
    await result;
  }
}

async function fetchRelatedInstance(
  owner: Record<string, any>,
  Model: any,
  property: string
): Promise<Record<string, any> | null> {
  const conditions = conditionAssign(owner, Model);

  const item = await Model
    .find(conditions, { identityCache: false })
    .only(Model.id.concat(property))
    .first();

  return item ?? null;
}

function addLazyLoadProperty(name: string, Instance: Record<string, any>, Model: any, property: string): void {
  const method = ucfirst(name);
  const getterName = `get${method}`;
  const removerName = `remove${method}`;
  const setterName = `set${method}`;

  const getterAsyncName = `${getterName}Async`;
  const removerAsyncName = `${removerName}Async`;
  const setterAsyncName = `${setterName}Async`;

  const getter = async function (this: any): Promise<any> {
    const item = await fetchRelatedInstance(this, Model, property);
    return item ? item[property] : null;
  };

  const remover = async function (this: any): Promise<void> {
    const item = await fetchRelatedInstance(this, Model, property);
    if (!item) return;

    item[property] = null;
    await saveEntity(item);
  };

  const setter = async function (this: any, data: any): Promise<void> {
    const item = await fetchRelatedInstance(this, Model, property);
    if (!item) return;

    item[property] = data;
    await saveEntity(item);
  };

  Object.defineProperty(Instance, getterAsyncName, {
    value: getter,
    enumerable: false
  });

  Object.defineProperty(Instance, setterAsyncName, {
    value: setter,
    enumerable: false
  });

  Object.defineProperty(Instance, removerAsyncName, {
    value: remover,
    enumerable: false
  });

  Object.defineProperty(Instance, getterName, {
    value: getter,
    enumerable: false
  });

  Object.defineProperty(Instance, setterName, {
    value: setter,
    enumerable: false
  });

  Object.defineProperty(Instance, removerName, {
    value: remover,
    enumerable: false
  });
}

export function extend(Instance: any, Model: any, properties: Record<string, any>): void {
  for (const k in properties) {
    if (properties[k].lazyload === true) {
      addLazyLoadProperty(properties[k].lazyname || k, Instance, Model, k);
    }
  }
}

export default { extend };
