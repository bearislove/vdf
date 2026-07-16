export interface ProviderDescriptor<Name extends string, Capabilities extends object> {
  name: Name;
  label: string;
  capabilities: Capabilities;
}

type NamedProvider<Name extends string> = { readonly name: Name };

export class ProviderRegistry<
  Name extends string,
  Provider extends NamedProvider<Name>,
  Capabilities extends object,
> {
  private readonly providers = new Map<Name, Provider>();
  private readonly descriptors = new Map<Name, ProviderDescriptor<Name, Capabilities>>();

  register(
    provider: Provider,
    descriptor: Omit<ProviderDescriptor<Name, Capabilities>, "name">
  ): this {
    if (this.providers.has(provider.name)) {
      throw new Error(`Provider already registered: ${provider.name}`);
    }
    this.providers.set(provider.name, provider);
    this.descriptors.set(provider.name, { name: provider.name, ...descriptor });
    return this;
  }

  has(name: unknown): name is Name {
    return typeof name === "string" && this.providers.has(name as Name);
  }

  resolveName(requested: unknown, fallback: Name): Name {
    if (this.has(requested)) return requested;
    if (this.providers.has(fallback)) return fallback;
    const first = this.providers.keys().next().value as Name | undefined;
    if (first) return first;
    throw new Error("No providers registered");
  }

  get(name: Name): Provider {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Unknown provider: ${name}`);
    return provider;
  }

  descriptor(name: Name): ProviderDescriptor<Name, Capabilities> {
    const descriptor = this.descriptors.get(name);
    if (!descriptor) throw new Error(`Unknown provider: ${name}`);
    return descriptor;
  }

  list(): Array<ProviderDescriptor<Name, Capabilities>> {
    return Array.from(this.descriptors.values());
  }

  findByCapability(predicate: (capabilities: Capabilities) => boolean): Name | undefined {
    return this.list().find((descriptor) => predicate(descriptor.capabilities))?.name;
  }
}

