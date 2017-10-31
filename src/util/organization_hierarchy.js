/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS204: Change includes calls to have a more natural evaluation order
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const { Department } = require('app/models');

    return {
        generateDepartmentDescription(department) {
            let needle;
            const rootDepartment = department.get('hierarchy')[0];  // city
            const unitDepartment = department; // unit

            if (rootDepartment.organization_type !== 'MUNICIPALITY') {
                return null;
            }

            if ((needle = unitDepartment.get('organization_type'), [
                    'MUNICIPALLY_OWNED_COMPANY', 'MUNICIPAL_ENTERPRISE_GROUP'].includes(needle))) {
                return unitDepartment.getText('name');
            }

            if (unitDepartment.get('organization_type') === 'MUNICIPALITY') {

                let middle;
                const sectorDepartment = new Department(department.get('hierarchy')[1]);

                if (unitDepartment.get('level') === 1) {
                    return sectorDepartment.getText('name');
                }

                if (department.get('hierarchy').length < 3) {
                    return null;
                }

                const segmentDepartment = new Department(department.get('hierarchy')[2]);

                if (sectorDepartment.get('organization_type') ===
                        (middle = segmentDepartment.get('organization_type')) && middle === 'MUNICIPALITY') {
                    return sectorDepartment.getText('name') + ', ' + segmentDepartment.getText('name');
                }
                return sectorDepartment.getText('name');
            }

            return null;
        }
    };
});
