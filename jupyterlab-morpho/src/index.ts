/**
 * JupyterLab plugin: register Morpho with the CodeMirror language registry.
 */

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IEditorLanguageRegistry } from '@jupyterlab/codemirror';
import { LanguageSupport } from '@codemirror/language';

import { morpho } from './language';

const plugin: JupyterFrontEndPlugin<void> = {
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

export default plugin;
