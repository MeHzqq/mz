import gateHtml from './gate.html';
import directoryHtml from './_content/directory.html';
import {createHandler} from './handler.mjs';

export default {fetch:createHandler({gateHtml, directoryHtml})};
