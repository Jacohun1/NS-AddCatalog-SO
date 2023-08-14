/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */

// Load Necessary Modules
define(['N/record', 'N/search', 'N/format', 'N/log'], function (record, search, format, log) {

    // Update last catalog order date for the customer
    function updateLastCatalog(customerId, today) {
        const updateCatDate = record.submitFields({
            type: record.Type.CUSTOMER,
            id: customerId,
            values: { custentity_last_order_date: today }
        });
    }

    // Check if the script should run based on the context and new sales order record
    function shouldRunScript(context, newRecord) {
        if (context.type != context.UserEventType.CREATE) return false;
    
        const orderTotal = newRecord.getValue({ fieldId: 'subtotal' });
        const salesRepId = newRecord.getValue({ fieldId: 'salesrep' });
        const shipMethod = newRecord.getValue({ fieldId: 'shipmethod' });
    
        const validSalesRepIds = [103159, 31538, 248532, 89168, 82602, 104920, 9]; // Platt, Ben Yachty, GRAVY, Anna, IS, Texas, Sunny
      //Christa & Tarah should be exluded on official go live
        const minOrderTotal = 49;
        const validShipMethods = [982, 4602, 2]; // Customer Pickup, UPS Ground, Fedex Ground
    
        const salesRepMatch = validSalesRepIds.some(id => id == salesRepId);
        const shipMethodMatch = validShipMethods.some(method => method == shipMethod);

        log.debug('shouldRunScript', `orderTotal: ${orderTotal}, salesRepId: ${salesRepId}, shipMethod: ${shipMethod}`);
        log.debug('shouldRunScript', `salesRepMatch: ${salesRepMatch}, shipMethodMatch: ${shipMethodMatch}`);
      
        return salesRepMatch && orderTotal >= minOrderTotal && shipMethodMatch;
    }

    // Get customer information using lookupFields
    function getCustomerInfo(customerId) {
        return search.lookupFields({
            type: search.Type.CUSTOMER,
            id: customerId,
            columns: ['entityid', 'custentity_last_order_date', 'custentity_catalog_no_send']
        });
    }

    // Calculate days since the last catalog was sent
    function getDaysSinceLastCatalog(customerLastCatalogString, today) {
        if (customerLastCatalogString === "") {
            return 366;
        }

        const customerLastCatalog = format.parse({
            value: customerLastCatalogString,
            type: format.Type.DATE
        });

        return Math.round((today - customerLastCatalog) / 86400000);
    }

    function shouldSkipCustomer(customerName, daysSinceLastCatalog, customerNoCatalog) {
        const maxDaysSinceLastCatalog = 365;

        if (customerNoCatalog){
            return true;
        } else if (customerName != 'Amazon Online Sales' && daysSinceLastCatalog <= maxDaysSinceLastCatalog){
            return true;
        } else {
            return false;
        }
    }

    // Retrieve catalog information from the system
    function getCatalogs() {
        const catalogSearch = search.create({
            type: 'customrecord_catalogs',
            columns: ['name', 'custrecord_cat_prod_id', 'internalid', 'custrecord_min_price'],
            filters: [
                ['isinactive', search.Operator.IS, false]
            ]
        });
    
        const catalogSearchResults = catalogSearch.run().getRange({ start: 0, end: 100 });
    
        let catalogDictionary = new Map();
        let allCatalogSku = [];
    
        // Create a dictionary and a list of catalog SKUs
        for (const itemResult of catalogSearchResults) {
            const catSku = itemResult.getValue('custrecord_cat_prod_id');
            const catName = itemResult.getValue('name');
            const catRecordId = itemResult.getValue('internalid');
            const catMinPrice = parseFloat(itemResult.getValue('custrecord_min_price')) || 0;
            allCatalogSku.push(catSku);
            catalogDictionary.set(catRecordId, { catalogname: catName, catalogsku: catSku, minprice: catMinPrice });
        }
        return { catalogDictionary, allCatalogSku };
    }
    
    // Retrieve sales order items from the new sales order record
    function getSalesOrderItems(newRecord) {
        const lineCount = newRecord.getLineCount({ sublistId: 'item' });
    
        let allSoItems = [];
    
        // Iterate through line items and collect item IDs
        for (let i = 0; i < lineCount; i++) {
            const itemId = newRecord.getSublistValue({
                sublistId: 'item',
                fieldId: 'item',
                line: i
            });
    
            allSoItems.push(itemId);
        }
    
        return allSoItems;
    }
    
    // Get the catalogs associated with the items in the sales order
    function getItemCatalogs(allSoItems) {
        let itemSearch = search.create({
            type: search.Type.ITEM,
            columns: ['itemid', 'displayname', 'custitem_catalog_field'],
            filters: [
                ['isinactive', search.Operator.IS, false],
                'AND',
                ['internalid', search.Operator.ANYOF, allSoItems]
            ]
        });
    
        let itemResults = itemSearch.run().getRange({ start: 0, end: 100 });
    
        let catalogsOnSo = new Set();
    
        // Iterate through item results and add catalog fields to the set
        itemResults.forEach((itemResult) => {
            const catalogField = itemResult.getValue('custitem_catalog_field');
            
          // Only add the catalogField if it's not empty
          if (catalogField) {
            catalogsOnSo.add(catalogField);
        }
        });
    
        return catalogsOnSo;
    }
    
    // Add catalogs to the sales order based on the catalog list and dictionary
    function addCatalogsToSalesOrder(newRecord, soCatalogList, catalogDictionary) {
        const lineCount = newRecord.getLineCount({ sublistId: 'item' });
        const orderSubTotal = newRecord.getValue({ fieldId: 'subtotal' });
        let soLineNumber = 0 //determines what line of the sales order the catalog should be added to
    
        // Iterate through the catalog list and add catalog items to the sales order
        for (let i = 0; i < soCatalogList.length; i++) {
            const catalogKey = soCatalogList[i];
            const catalogInfo = catalogDictionary.get(catalogKey);
            const currentCatalog = catalogInfo.catalogsku;
            const currentDescription = `${catalogInfo.catalogname} Catalog`;
    
            // Check min price against order subtotal
            if (catalogInfo.minprice >= orderSubTotal) {
                continue; // skip this catalog
            }
    
            const currentLine = lineCount + soLineNumber;
    
            // Set catalog item values for the sales order line
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
                value: currentDescription
            });
            soLineNumber++;
        }
        return soLineNumber;
    }

    // Main function that runs before submitting the record
    function beforeSubmit(context) {
        log.debug('beforeSubmit', 'Script triggered');
        const newRecord = context.newRecord;

        // Exit early if the script should not run
        if (!shouldRunScript(context, newRecord)) {
          log.debug('beforeSubmit', 'Script should not run, exiting early');  
          return;
        }

        // Get customer and order information
        const customerId = newRecord.getValue({ fieldId: 'entity' });
        const customerInfo = getCustomerInfo(customerId);
        const customerName = customerInfo.entityid;
        const customerLastCatalogString = customerInfo.custentity_last_order_date;
        const customerNoCatalog = customerInfo.custentity_catalog_no_send;

        const today = new Date();
        const daysSinceLastCatalog = getDaysSinceLastCatalog(customerLastCatalogString, today);
         // Skip the customer if conditions are met
        if (shouldSkipCustomer(customerName, daysSinceLastCatalog, customerNoCatalog)) {
          log.debug('beforeSubmit', `Skipping customer ${customerName}`);  
          return;
        }

        // Retrieve catalog information and sales order items
        const { catalogDictionary, allCatalogSku } = getCatalogs();
        const salesOrderItems = getSalesOrderItems(newRecord);

        // Update the customer's last catalog order date if a catalog SKU is already in the sales order
        if (allCatalogSku.some((catSku) => salesOrderItems.includes(catSku))) {
          log.debug('beforeSubmit', 'Catalog SKU found in sales order items, updating customer last catalog order date');  
          updateLastCatalog(customerId, today);
            return;
        }

        // Get catalogs associated with the items in the sales order
        const catalogsOnSo = getItemCatalogs(salesOrderItems);

        // Exit early if no catalogs are found for the sales order items
        if (catalogsOnSo.size === 0) {
          log.debug('beforeSubmit', 'No catalogs found for sales order items, exiting early');  
          return;
        }

        // Create a list of catalogs to add to the sales order
        const soCatalogList = Array.from(catalogsOnSo);

        // Add catalogs to the sales order
        let catalogsAdded = addCatalogsToSalesOrder(newRecord, soCatalogList, catalogDictionary);

        // Update the customer's last catalog order date
        if (catalogsAdded > 0){
            updateLastCatalog(customerId, today);
        }
    }

    // Export the beforeSubmit function
    return {
        beforeSubmit: beforeSubmit
    };
});
