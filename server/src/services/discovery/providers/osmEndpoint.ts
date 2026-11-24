const publicNominatim = 'nominatim.openstreetmap.org';

export function resolveOsmEndpoint(value: string, envVar: string, service: string, interpreter = false) {
  const input = value.trim();
  if (!input) return { error: `Set ${envVar} to an authorized ${service} endpoint.` };
  const invalid = { error: `${envVar} must be an HTTP or HTTPS URL without a query or fragment.` };
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return invalid;
  }
  if (!/^https?:\/\//i.test(input) || url.search || url.hash) return invalid;
  const hostname = url.hostname.replace(/\.+$/, '');
  if (hostname === publicNominatim || hostname.endsWith(`.${publicNominatim}`)) {
    return { error: `Public Nominatim is blocked. Set ${envVar} to an authorized ${service} endpoint.` };
  }
  url.search = '';
  url.hash = '';
  const endpoint = url.toString().replace(/\/+$/, '');
  if (interpreter && !url.pathname.replace(/\/+$/, '').endsWith('/interpreter')) {
    return { error: `${envVar} must specify the full Overpass interpreter URL.` };
  }
  return { endpoint };
}
