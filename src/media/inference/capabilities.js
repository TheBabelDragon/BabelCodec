/**
 * Local inference capability detection — honest, no bundled model weights.
 * Does not advertise generation as available without a real backend.
 */

/**
 * @returns {Promise<{
 *   webgpu: boolean,
 *   wasm: boolean,
 *   threads: boolean,
 *   backend: 'none'|'webgpu'|'wasm'|'cpu',
 *   operations: string[],
 *   modelsAvailable: boolean,
 *   message: string,
 * }>
 */
export async function detectLocalInferenceCapabilities() {
  let webgpu = false;
  try {
    webgpu = typeof navigator !== 'undefined' && !!navigator.gpu;
    if (webgpu && navigator.gpu.requestAdapter) {
      const adapter = await navigator.gpu.requestAdapter();
      webgpu = Boolean(adapter);
    }
  } catch {
    webgpu = false;
  }

  let wasm = false;
  try {
    wasm = typeof WebAssembly !== 'undefined';
  } catch {
    wasm = false;
  }

  let threads = false;
  try {
    threads = typeof SharedArrayBuffer !== 'undefined';
  } catch {
    threads = false;
  }

  // No models are shipped in-repo; do not claim generation works.
  const modelsAvailable = false;
  const backend = modelsAvailable ? (webgpu ? 'webgpu' : wasm ? 'wasm' : 'cpu') : 'none';

  return {
    webgpu,
    wasm,
    threads,
    backend,
    operations: modelsAvailable ? ['generate'] : [],
    modelsAvailable,
    message: modelsAvailable
      ? 'Local inference backend ready'
      : 'No local inference models are bundled. Editing and procedural create remain fully available offline.',
  };
}
