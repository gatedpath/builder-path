/**
 * `permission.isAllowed(address)`: whether the wallet may send transactions on this
 * chain. The permission contract is resolved from the registry unless `permission`
 * is given. False for any wallet that has not completed access.redbelly.network.
 */
export async function isAllowed(address: string, opts: HelperOptions & { permission?: Hex }): Promise<boolean> {
