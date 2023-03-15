/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */
 
 
//Current Issues that need to be addressed:
//1. Hard coded IDs in line 73 need to be better addressed
//2. Hard code in line 98 - this should become dynamic
//3. The loop that runs over each item in the SO does a search every time, when it should only conduct one search

// Load Necessary Modules
define(['N/record', 'N/search', 'N/format'], function(record, search, format) {

    //Update the last catalog date
    function updateLastCatalog(customerId, today) {

        const updateCatDate = record.submitFields({
            type: record.Type.Customer,
            id: customerId,
            values: {custentity_last_order_date : today}
        })
      }
    
    function beforeSubmit(context) {

        //Only run on sales orders being created over $500
        if (context.type !== context.UserEventType.CREATE) {return;}

            const newRecord = context.newRecord;


            if (newRecord.getValue({
                    fieldId: 'subtotal'
                }) < 500) {
                return;
            }

            //Validate that this customer hasnt received a catalog in the last year
            const customerId = newRecord.getValue({fieldId: 'entity'});
            const customerInfo = search.lookupFields({
                type: search.Type.CUSTOMER,
                id: customerId,
                columns: ['entityid', 'custentity_last_order_date', 'custentity_catalog_no_send']
            });

            const customerName = customerInfo.entityid;
            const customerLastCatalogString = customerInfo.custentity_last_order_date;
            const customerNoCatalog = customerInfo.custentity_catalog_no_send;

            const today = new Date();
            const customerLastCatalog = new Date(customerLastCatalogString) ? format.parse({
                value: customerLastCatalogString,
                type: format.Type.Date
            }) : "";
            const daysSinceLastCatalog = (customerLastCatalogString == "") ? 366 : Math.round((today - customerLastCatalog) / 86400000);

            if (customerName !== 'Amazon Online Sales' || daysSinceLastCatalog <= 365 || customerNoCatalog) {return;}

            //Go through each item to see what catalogs the order needs
            let uniqueCatalogs = new Set();
            const lineCount = newRecord.getLineCount({
                sublistId: 'item'
            });

            for (let i = 0; i < lineCount; i++) {
                const itemId = newRecord.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: i
                });

                //If a catalog is already on the order exit script
                if (itemId === 8102 || itemId === 8101 || itemId === 2769 || itemId === 8103) {
                    updateLastCatalog(customerId, today)
                    return;
                }
                const itemCatalog = search.lookupFields({
                    type: search.Type.ITEM,
                    id: itemId,
                    columns: ['custitem_catalog_field']
                }).custitem_catalog_field;

                if (itemCatalog && itemCatalog.length > 0) {
                    uniqueCatalogs.add(itemCatalog[0].text);
                }
            }

            //Exit script if no products have a catalog
            if (uniqueCatalogs.size === 0){
                return;
            }
            const catalogs = Array.from(uniqueCatalogs);
        
            for (let i = 0; i < catalogs.length; i++) {
                const currentLine = lineCount + i;
                let currentCatalog = "";
                let catalogDesc = catalogs[i] + " CATALOG";
                switch (catalogs[i]) {
                    case "BODY SHOP":
                        currentCatalog = 8102;
                        break;
                    case "INDUSTRIAL":
                        currentCatalog = 8101;
                        break;
                    case "PROTECTIVE":
                        currentCatalog = 8103;
                        break;
                    case "NDT":
                        currentCatalog = 2769;
                        break;
                    default:
                        currentCatalog = 2769; //NDT & Other Catalog cannot exist -need to add NDT catalog Item
                        catalogDesc = catalogs[i] + " | Catalog Not On NS Script"
                        break;
                }

                newRecord.setSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: currentLine,
                    value: currentCatalog
                });

                newRecord.setSublistValue({
                    sublistId: 'item',
                    fieldId: 'amount',
                    line: currentLine,
                    value: 0
                });

                newRecord.setSublistValue({
                    sublistId: 'item',
                    fieldId: 'quantity',
                    line: currentLine,
                    value: 1
                });

                newRecord.setSublistValue({
                    sublistId: 'item',
                    fieldId: 'description',
                    line: currentLine,
                    value: catalogDesc
                });
            }


            updateLastCatalog(customerId, today)
        
    }

    return {
        beforeSubmit: beforeSubmit
    };
});
