/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function() {
    const FINNISH_ALPHABET = 'abcdefghijklmnopqrstuvwxyzåäö';

    // Thank you
    // http://stackoverflow.com/questions/3630645/how-to-compare-utf-8-strings-in-javascript/3633725#3633725
    const alpha = function(direction, caseSensitive, alphabetOrder) {
        if (alphabetOrder == null) { alphabetOrder = FINNISH_ALPHABET; }
        const compareLetters = function(a, b) {
            const [ia, ib] = Array.from([alphabetOrder.indexOf(a), alphabetOrder.indexOf(b)]);
            if ((ia === -1) || (ib === -1)) {
                if (ib !== -1) {
                    return a > 'a';
                }
                if (ia !== -1) {
                    return 'a' > b;
                }
                return a > b;
            }
            return ia > ib;
        };
        direction = direction || 1;
        return function(a, b) {
            const length = Math.min(a.length, b.length);
            caseSensitive = caseSensitive || false;
            if (!caseSensitive) {
                a = a.toLowerCase();
                b = b.toLowerCase();
            }
            let pos = 0;
            while ((a.charAt(pos) === b.charAt(pos)) && (pos < length)) {
                pos++;
            }

            if (compareLetters(a.charAt(pos), b.charAt(pos))) {
                return direction;
            } else {
                return -direction;
            }
        };
    };

    //a.sort alpha('ABCDEFGHIJKLMNOPQRSTUVWXYZaàâäbcçdeéèêëfghiïîjklmnñoôöpqrstuûüvwxyÿz')
    return {makeComparator: alpha};
});
