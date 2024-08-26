const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

module.exports = cds.service.impl(async function () {
    const Accountingapi = await cds.connect.to('API_OPLACCTGDOCITEMCUBE_SRV');
    //const gsttaxapi = await cds.connect.to('API_OPLACCTGDOCITEMCUBE_SRV'); // Replace with your GST tax API connection
    const { accounting, AccountingDocumentItems, accdoc } = this.entities;

    // Handle READ operation on the ext entity to filter based on specific criteria
    this.on('READ', 'accounting', async (req) => {
        try {
            const query = req.query
                .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
                .and({ CompanyCodeCurrency: 'INR' });

            const result = await Accountingapi.run(query);

            if (!Array.isArray(result)) {
                console.error('Unexpected data format for ext entity:', result);
                return [];
            }

            return result;
        } catch (error) {
            console.error('Error fetching data from ext entity:', error);
            throw error;
        }
    });

    // Handle before READ operation on 'Accounting' entity to fetch and insert new records
    this.before('READ', 'accdoc', async (req) => {
        try {
            const query = SELECT.from(accounting)
                .columns('CompanyCode', 'FiscalYear', 'FiscalPeriod', 'AccountingDocument', 'AccountingDocumentType')
                .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
                .and({ CompanyCodeCurrency: 'INR' });

            const res = await Accountingapi.run(query);

            if (!Array.isArray(res)) {
                console.error('Unexpected data format for Accounting records:', res);
                return;
            }

            const groupMap = new Map();
            res.forEach(item => {
                const groupKey = `${item.CompanyCode}-${item.FiscalYear}-${item.AccountingDocument}`;
                if (!groupMap.has(groupKey)) {
                    item.ID = uuidv4();
                    groupMap.set(groupKey, item);
                }
            });

            const groupedData = Array.from(groupMap.values());
            console.log('Grouped records:', groupedData);

            const existingRecords = await cds.run(
                SELECT.from(accdoc)
                    .columns('CompanyCode', 'FiscalYear', 'AccountingDocument')
                    .where({
                        CompanyCode: { in: groupedData.map(r => r.CompanyCode) },
                        FiscalYear: { in: groupedData.map(r => r.FiscalYear) },
                        AccountingDocument: { in: groupedData.map(r => r.AccountingDocument) }
                    })
            );

            const newRecords = groupedData.filter(groupedRecord => {
                return !existingRecords.some(existingRecord =>
                    existingRecord.CompanyCode === groupedRecord.CompanyCode &&
                    existingRecord.FiscalYear === groupedRecord.FiscalYear &&
                    existingRecord.AccountingDocument === groupedRecord.AccountingDocument
                );
            });

            if (newRecords.length > 0) {
                await cds.run(UPSERT.into(accdoc).entries(newRecords));
                console.log('Inserted new records into Accounting:', newRecords);
            } else {
                console.log('No new records to insert into Accounting.');
            }
        } catch (error) {
            console.error('Error processing Accounting records:', error);
            throw error;
        }
    });

    // Handle before READ operation on 'Items' entity to fetch and insert new records
    this.before('READ', 'AccountingDocumentItems', async (req) => {
        try {
            const query = SELECT.from(ext)
                .columns('AccountingDocument', 'TaxCode', 'GLAccount')
                .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
                .and({ CompanyCodeCurrency: 'INR' });

            const sourceRecords = await Accountingapi.run(query);

            if (!Array.isArray(sourceRecords)) {
                console.error('Unexpected data format for Items records:', sourceRecords);
                return;
            }

            const recordsWithUUID = sourceRecords.map(record => ({
                ...record,
                ID: uuidv4(),
                id: record.AccountingDocument
            }));

            const existingRecords = await cds.run(
                SELECT.from(AccountingDocumentItems)
                    .columns('AccountingDocument')
                    .where({
                        AccountingDocument: { in: recordsWithUUID.map(r => r.AccountingDocument) }
                    })
            );

            const existingMap = new Map();
            existingRecords.forEach(record => {
                existingMap.set(record.AccountingDocument, record);
            });

            const newRecords = recordsWithUUID.filter(record => {
                return !existingMap.has(record.AccountingDocument);
            });

            if (newRecords.length > 0) {
                await cds.run(UPSERT.into(AccountingDocumentItems).entries(newRecords));
                console.log('Upserted records with UUIDs into Items:', newRecords);
            } else {
                console.log('No new records to upsert into Items.');
            }
        } catch (error) {
            console.error('Error processing Items records:', error);
            throw error;
        }
    });

    // Define the fetch action
    this.on('fetchRecords', async (req) => {
        try {
            // Fetch data from the external service
            const query = SELECT.from(accounting)
                .columns('CompanyCode', 'FiscalYear', 'FiscalPeriod', 'AccountingDocument', 'AccountingDocumentType', 'TaxCode', 'GLAccount')
                .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
                .and({ CompanyCodeCurrency: 'INR' });

            const res = await Accountingapi.run(query);

            if (!Array.isArray(res)) {
                console.error('Unexpected data format for fetch action:', res);
                return { message: 'No records found.' };
            }

            // Process Accounting records
            const groupMap = new Map();
            res.forEach(item => {
                const groupKey = `${item.CompanyCode}-${item.FiscalYear}-${item.AccountingDocument}`;
                if (!groupMap.has(groupKey)) {
                    item.ID = uuidv4();
                    groupMap.set(groupKey, item);
                }
            });

            const groupedData = Array.from(groupMap.values());
            console.log('Grouped records for fetch action:', groupedData);

            // Insert or update Accounting records
            const existingRecords = await cds.run(
                SELECT.from(accdoc)
                    .columns('CompanyCode', 'FiscalYear', 'AccountingDocument')
                    .where({
                        CompanyCode: { in: groupedData.map(r => r.CompanyCode) },
                        FiscalYear: { in: groupedData.map(r => r.FiscalYear) },
                        AccountingDocument: { in: groupedData.map(r => r.AccountingDocument) }
                    })
            );

            const newRecords = groupedData.filter(groupedRecord => {
                return !existingRecords.some(existingRecord =>
                    existingRecord.CompanyCode === groupedRecord.CompanyCode &&
                    existingRecord.FiscalYear === groupedRecord.FiscalYear &&
                    existingRecord.AccountingDocument === groupedRecord.AccountingDocument
                );
            });

            if (newRecords.length > 0) {
                await cds.run(UPSERT.into(accdoc).entries(newRecords));
                console.log('Inserted new records into Accounting via fetch action:', newRecords);
            } else {
                console.log('No new records to insert into Accounting via fetch action.');
            }

            // Process Items records
            const recordsWithUUID = res.map(record => ({
                ...record,
                ID: uuidv4(),
                id: record.AccountingDocument
            }));

            const existingItemsRecords = await cds.run(
                SELECT.from(AccountingDocumentItems)
                    .columns('AccountingDocument')
                    .where({
                        AccountingDocument: { in: recordsWithUUID.map(r => r.AccountingDocument) }
                    })
            );

            const existingItemsMap = new Map();
            existingItemsRecords.forEach(record => {
                existingItemsMap.set(record.AccountingDocument, record);
            });

            const newItemsRecords = recordsWithUUID.filter(record => {
                return !existingItemsMap.has(record.AccountingDocument);
            });

            if (newItemsRecords.length > 0) {
                await cds.run(UPSERT.into(AccountingDocumentItems).entries(newItemsRecords));
                console.log('Upserted records with UUIDs into Items via fetch action:', newItemsRecords);
            } else {
                console.log('No new records to upsert into Items via fetch action.');
            }

            // Handle LGSTTaxItem processing
            let lastsyncdate1 = await cds.run(
                SELECT.one.from(accdoc).columns('LastChangeDate').orderBy('LastChangeDate desc')
            );

            let counttaxdocs;

            if (lastsyncdate1 && lastsyncdate1.LastChangeDate) {
                const taxlastsyncdatetime = lastsyncdate1.LastChangeDate.toISOString();
                counttaxdocs = await Accountingapi.send({
                    method: 'GET',
                    path: `A_OperationalAcctgDocItemCube/$count?$filter=LastChangeDate gt datetimeoffset'${taxlastsyncdatetime}'`
                });
            } else {
                counttaxdocs = await Accountingapi.send({
                    method: 'GET',
                    path: 'A_OperationalAcctgDocItemCube/$count'
                 

                });
            }
            function convertSAPDateToISO(dateString) {
    const timestamp = parseInt(dateString.match(/\d+/)[0], 10); // Extract the timestamp
    return new Date(timestamp).toISOString(); // Convert to ISO string
}

function removeDuplicateEntries(results) {
    const uniqueResults = [];
    const seenIds = new Set();

    for (const item of results) {
        if (!seenIds.has(item.ID)) {
            uniqueResults.push(item);
            seenIds.add(item.ID);
        }
    }

    return uniqueResults;
}

for (let i = 0; i < counttaxdocs; i += 5000) {
    const taxdocitemsQuery = {
        method: 'GET',
        path: `A_OperationalAcctgDocItemCube?$skip=${i}&$top=5000`
    };

    let results = await Accountingapi.send(taxdocitemsQuery);

    results = results.map(item => {
        // Ensure LastChangeDate is in ISO format
        if (item.LastChangeDate) {
            item.LastChangeDate = convertSAPDateToISO(item.LastChangeDate);
        }

        // Ensure ID is not null
        if (!item.ID) {
            item.ID = generateUniqueID(item); // Optionally generate a unique ID if missing
        }

        return item;
    });

    // Remove duplicate entries
    results = removeDuplicateEntries(results);

    if (results.length > 0) { // Only attempt UPSERT if there are valid records
        console.log("In Batch ", i, " of ", counttaxdocs, " records");
        await cds.run(UPSERT.into(accdoc).entries(results));
    } else {
        console.log("Skipping Batch ", i, " due to missing or duplicate IDs");
    }
}

function generateUniqueID(item) {
    return `${item.CompanyCode}-${item.FiscalYear}-${item.AccountingDocument}-${item.FiscalPeriod}`;}

            console.log('Count of new tax documents:', counttaxdocs);

            // Fetch and process GST tax items if needed
            // ...

            return { message: 'Fetch action completed successfully.' };
        } catch (error) {
            console.error('Error in fetch action:', error);
            throw error;
        }
    });
});