/**
 * This is an extension for Xcratch.
 */

import iconURL from './entry-icon.png';
import insetIconURL from './inset-icon.svg';
import translations from './translations.json';
import {version as packageVersion} from '../../../../../../package.json';

const version = `v${packageVersion}`;

/**
 * Formatter to translate the messages in this extension.
 * This will be replaced which is used in the React component.
 * @param {object} messageData - data for format-message
 * @returns {string} - translated message for the current locale
 */
let formatMessage = messageData => messageData.defaultMessage;

const entry = {
    get name () {
        return formatMessage({
            id: 'xcxVPen.entry.name',
            defaultMessage: 'Vector Pen'
        });
    },
    extensionId: 'xcxVPen',
    extensionURL: 'https://yokobond.github.io/xcx-vpen/dist/xcxVPen.mjs',
    collaborator: 'Koji Yokokawa',
    iconURL: iconURL,
    insetIconURL: insetIconURL,
    get description () {
        return `${formatMessage({
            defaultMessage: 'Draw SVG paths like the pen extension',
            id: 'xcxVPen.entry.description'
        })} (${version})`;
    },
    tags: ['image', 'vector', 'pen', 'svg'],
    featured: true,
    disabled: false,
    bluetoothRequired: false,
    internetConnectionRequired: false,
    helpLink: 'https://yokobond.github.io/xcx-vpen/',
    setFormatMessage: formatter => {
        formatMessage = formatter;
    },
    translationMap: translations
};

export {entry}; // loadable-extension needs this line.
export default entry;
