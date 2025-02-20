/**
 * This is an extension for Xcratch.
 */

import iconURL from './entry-icon.png';
import insetIconURL from './inset-icon.svg';
import translations from './translations.json';

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
            defaultMessage: 'Vector Pen',
            description: 'name of the extension'
        });
    },
    extensionId: 'xcxVPen',
    extensionURL: 'https://yokobond.github.io/xcx-vpen/dist/xcxVPen.mjs',
    collaborator: 'yokobond',
    iconURL: iconURL,
    insetIconURL: insetIconURL,
    get description () {
        return formatMessage({
            defaultMessage: 'Draw SVG paths like the pen extension',
            description: 'Description for this extension',
            id: 'xcxVPen.entry.description'
        });
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
