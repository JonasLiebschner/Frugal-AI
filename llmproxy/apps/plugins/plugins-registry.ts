export type PluginItem = {
  id: string;
};

export type PluginRegistry<
  TItem extends PluginItem = PluginItem,
> = PluginItem & {
  map: Map<string, TItem>;
  get: (id: string) => TItem | undefined;
  list: () => TItem[];
  register: (items: TItem | TItem[]) => TItem[];
};

export interface PluginsService {
  registry: PluginRegistry<PluginRegistry<any>>;
  registerRegistry: PluginRegistry<PluginRegistry<any>>["register"];
  getRegistry: PluginRegistry<PluginRegistry<any>>["get"];
  get: PluginRegistry<PluginRegistry<any>>["get"];
  getList: <TItem = PluginItem>(registryName: string) => TItem[];
  getItem: <TItem = PluginItem>(
    registryName: string,
    itemName: string,
  ) => TItem | undefined;
  createRegistry: <TItem extends PluginItem = PluginItem>(
    registryName: string,
  ) => PluginRegistry<TItem>;
  registerItem: <TItem extends PluginItem = PluginItem>(
    registryName: string,
    items: TItem | TItem[],
  ) => TItem[];
}

export function createPluginRegistry<
  TItem extends PluginItem = PluginItem,
>(name: string): PluginRegistry<TItem> {
  const registry: PluginRegistry<TItem> = {
    id: name,
    map: new Map<string, TItem>(),
    get: (id: string) => registry.map.get(id),
    list: () => Array.from(registry.map.values()),
    register: (items: TItem | TItem[]) => {
      const normalizedItems = Array.isArray(items) ? items : [items];

      for (const item of normalizedItems) {
        registry.map.set(item.id, item);
      }

      return normalizedItems;
    },
  };

  return registry;
}

export function createPluginsService(name: string): PluginsService {
  const registry = createPluginRegistry<PluginRegistry>(name);

  const service: PluginsService = {
    registry,
    registerRegistry: registry.register,
    getRegistry: registry.get,
    get: registry.get,
    getList: <TItem = PluginItem>(registryName: string) =>
      (registry.get(registryName)?.list() as TItem[] | undefined) ?? [],
    getItem: <TItem = PluginItem>(registryName: string, itemName: string) =>
      registry.get(registryName)?.get(itemName) as TItem | undefined,
    createRegistry: <TItem extends PluginItem = PluginItem>(
      registryName: string,
    ) => {
      let pluginRegistry = registry.get(registryName) as
        | PluginRegistry<TItem>
        | undefined;

      if (!pluginRegistry) {
        pluginRegistry = createPluginRegistry<TItem>(registryName);
        registry.register(pluginRegistry as unknown as PluginRegistry);
      }

      return pluginRegistry;
    },
    registerItem: <TItem extends PluginItem = PluginItem>(
      registryName: string,
      items: TItem | TItem[],
    ) => {
      return service.createRegistry<TItem>(registryName).register(items);
    },
  };

  return service;
}

