/**
 * @productcraft/flags-openfeature: ProductCraft Flags as an OpenFeature server provider (design 8.3).
 * Evaluation stays local in `FlagsClient`; user attributes never leave your app.
 */
export { ProductCraftFlagsProvider, toResolution, toUser } from "./provider.js";
export type {
  ProductCraftFlagsProviderOptions,
  ProviderLogger,
} from "./provider.js";
