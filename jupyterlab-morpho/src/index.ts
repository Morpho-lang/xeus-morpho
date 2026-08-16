/**
 * JupyterLab plugins: Morpho language + morphoview MIME renderer.
 */

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IEditorLanguageRegistry } from '@jupyterlab/codemirror';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { LanguageSupport } from '@codemirror/language';

import { morpho } from './language';
import { rendererFactory, MORPHOVIEW_MIME } from './mime';

const languagePlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-morpho:plugin',
  description: 'Morpho syntax highlighting for JupyterLab',
  autoStart: true,
  requires: [IEditorLanguageRegistry],
  activate: (_app: JupyterFrontEnd, languages: IEditorLanguageRegistry) => {
    languages.addLanguage({
      name: 'morpho',
      displayName: 'Morpho',
      mime: 'text/x-morpho',
      extensions: ['morpho'],
      load: async () => new LanguageSupport(morpho())
    });
  }
};

const mimePlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-morpho:morphoview',
  description: 'Morphoview WebGL MIME renderer',
  autoStart: true,
  requires: [IRenderMimeRegistry],
  activate: (_app: JupyterFrontEnd, rendermime: IRenderMimeRegistry) => {
    rendermime.addFactory(rendererFactory);
    // Ensure preferred order for our MIME
    void MORPHOVIEW_MIME;
  }
};

export default [languagePlugin, mimePlugin];
