import { beforeEach, describe, expect, it, vi } from 'vitest';

const createRoot = vi.hoisted(() => vi.fn());
const render = vi.hoisted(() => vi.fn());

vi.mock('react-dom/client', () => ({ createRoot }));

describe('application entry point', () => {
  beforeEach(() => {
    vi.resetModules();
    createRoot.mockReturnValue({ render });
    createRoot.mockClear();
    render.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('mounts the application into the root element', async () => {
    await import('../../src/main');

    const root = document.querySelector('#root');
    expect(createRoot).toHaveBeenCalledWith(root);
    expect(render).toHaveBeenCalledOnce();
  });

  it('fails clearly when the root element is missing', async () => {
    document.body.innerHTML = '';

    await expect(import('../../src/main')).rejects.toThrow('Root element was not found');
  });
});
