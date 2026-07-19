export const isLocalBuild = typeof __PXXIS_EXTENSION_TARGET__ === "undefined" || __PXXIS_EXTENSION_TARGET__ === "local";
export const developmentLoopbackHostnames: readonly string[] = typeof __PXXIS_EXTENSION_LOCAL_DEVELOPMENT_HOSTS__ === "undefined"
  ? []
  : __PXXIS_EXTENSION_LOCAL_DEVELOPMENT_HOSTS__;
export const defaultApiBaseUrl = typeof __PXXIS_EXTENSION_DEFAULT_API_BASE_URL__ === "undefined"
  ? "https://api.pxxis.cn"
  : __PXXIS_EXTENSION_DEFAULT_API_BASE_URL__;
export const localWebPort = typeof __PXXIS_EXTENSION_LOCAL_WEB_PORT__ === "undefined"
  ? 0
  : __PXXIS_EXTENSION_LOCAL_WEB_PORT__;
export const apiBaseUrlGuidance = typeof __PXXIS_EXTENSION_API_BASE_URL_GUIDANCE__ === "undefined"
  ? "服务器地址必须使用 HTTPS。"
  : __PXXIS_EXTENSION_API_BASE_URL_GUIDANCE__;
