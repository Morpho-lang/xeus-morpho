/**
 * JupyterLab MIME renderer for morphoview ASCII IR.
 */

import { Widget } from '@lumino/widgets';
import { IRenderMime } from '@jupyterlab/rendermime-interfaces';

import { parseMorphoview } from './parse';
import { MorphoviewGL } from './render';

export const MORPHOVIEW_MIME = 'application/vnd.morpho.morphoview';

/** Default viewer aspect (width:height). Notebook cells are wide; prefer taller. */
const VIEW_ASPECT = 4 / 3;
const MIN_HEIGHT = 420;
const MAX_HEIGHT = 720;

const INTERACT_HINT =
  'Click to interact · drag to orbit · scroll to zoom · Tab to reset view';

export class MorphoviewWidget extends Widget implements IRenderMime.IRenderer {
  private _canvas: HTMLCanvasElement;
  private _caption: HTMLDivElement;
  private _status: HTMLDivElement;
  private _gl: MorphoviewGL | null = null;
  private _ro: ResizeObserver | null = null;

  constructor() {
    super();
    this.addClass('jp-MorphoviewRenderer');
    this.node.style.width = '100%';
    this.node.style.minHeight = `${MIN_HEIGHT}px`;
    this.node.style.position = 'relative';
    this.node.style.overflow = 'hidden';

    this._canvas = document.createElement('canvas');
    this._canvas.style.display = 'block';
    this._canvas.style.width = '100%';
    this._canvas.style.height = `${MIN_HEIGHT}px`;
    this._canvas.style.touchAction = 'none';
    this._canvas.title = INTERACT_HINT;
    this.node.appendChild(this._canvas);

    this._caption = document.createElement('div');
    this._caption.className = 'jp-MorphoviewCaption';
    this._caption.hidden = true;
    this.node.appendChild(this._caption);

    this._status = document.createElement('div');
    this._status.className = 'jp-MorphoviewStatus';
    this._status.hidden = true;
    this.node.appendChild(this._status);
  }

  async renderModel(model: IRenderMime.IMimeModel): Promise<void> {
    const data = model.data[MORPHOVIEW_MIME];
    const ascii = typeof data === 'string' ? data : '';
    if (!ascii) {
      this._showStatus('Empty morphoview payload');
      return;
    }

    try {
      if (!this._gl) {
        this._gl = new MorphoviewGL(this._canvas);
        this._ro = new ResizeObserver(() => this._resize());
        this._ro.observe(this.node);
      }
      const scenes = parseMorphoview(ascii);
      const scene = scenes[0];
      if (!scene) {
        this._showStatus('No morphoview scene in payload');
        return;
      }
      this._hideStatus();
      if (scene.title) {
        this._canvas.setAttribute('aria-label', scene.title);
        this._caption.textContent = scene.title;
        this._caption.hidden = false;
      } else {
        this._canvas.setAttribute('aria-label', 'Morphoview');
        this._caption.textContent = '';
        this._caption.hidden = true;
      }
      this._canvas.title = INTERACT_HINT;
      this._resize();
      this._gl.setScene(scene);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._showStatus(`Morphoview render error: ${msg}`);
    }
  }

  dispose(): void {
    this._ro?.disconnect();
    this._gl?.dispose();
    this._gl = null;
    super.dispose();
  }

  private _showStatus(message: string): void {
    this._status.textContent = message;
    this._status.hidden = false;
  }

  private _hideStatus(): void {
    this._status.textContent = '';
    this._status.hidden = true;
  }

  private _resize(): void {
    const w = Math.max(this.node.clientWidth || 480, 160);
    const h = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(w / VIEW_ASPECT)));
    this.node.style.height = `${h}px`;
    this._canvas.style.height = `${h}px`;
    this._gl?.resize(w, h);
  }
}

export const rendererFactory: IRenderMime.IRendererFactory = {
  safe: true,
  mimeTypes: [MORPHOVIEW_MIME],
  defaultRank: 50,
  createRenderer: () => new MorphoviewWidget()
};
