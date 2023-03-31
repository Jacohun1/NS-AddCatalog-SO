/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */

// Load Necessary Modules
define(['N/record', 'N/search', 'N/format'], function (record, search, format) {

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
    
        const validSalesRepIds = [103159, 31538]; // Platt, Ben Yachty
        const minOrderTotal = 500;
        const validShipMethods = [982, 4602]; // Customer Pickup, Ground
    
        const salesRepMatch = validSalesRepIds.some(id => id == salesRepId);
        const shipMethodMatch = validShipMethods.some(method => method == shipMethod);
    
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

    // Determine if a customer should be skipped based on their name, days since last catalog, and customerNoCatalog flag
    function shouldSkipCustomer(customerName, daysSinceLastCatalog, customerNoCatalog) {
        const maxDaysSinceLastCatalog = 365;

        return (daysSinceLastCatalog <= maxDaysSinceLastCatalog || customerNoCatalog) && customerName !== 'Amazon Online Sales';
    }

    // Retrieve catalog information from the system
    function getCatalogs() {
        const catalogSearch = search.create({
            type: 'customrecord_catalogs',
            columns: ['name', 'custrecord_cat_prod_id', 'internalid'],
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
            allCatalogSku.push(catSku);
            catalogDictionary.set(catRecordId, { catalogname: catName, catalogsku: catSku });
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
            catalogsOnSo.add(catalogField);
        });
    
        return catalogsOnSo;
    }
    
    // Add catalogs to the sales order based on the catalog list and dictionary
    function addCatalogsToSalesOrder(newRecord, soCatalogList, catalogDictionary) {
        const lineCount = newRecord.getLineCount({ sublistId: 'item' });
    
        // Iterate through the catalog list and add catalog items to the sales order
        for (let i = 0; i < soCatalogList.length; i++) {
            const currentLine = lineCount + i;
            const catalogKey = soCatalogList[i];
            const catalogInfo = catalogDictionary.get(catalogKey);
            const currentCatalog = catalogInfo.catalogsku;
            const currentDescription = `${catalogInfo.catalogname} Catalog`;
    
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
        }
    }

    // Main function that runs before submitting the record
    function beforeSubmit(context) {
        const newRecord = context.newRecord;

        // Exit early if the script should not run
        if (!shouldRunScript(context, newRecord)) {
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
            return;
        }

        // Retrieve catalog information and sales order items
        const { catalogDictionary, allCatalogSku } = getCatalogs();
        const salesOrderItems = getSalesOrderItems(newRecord);

        // Update the customer's last catalog order date if a catalog SKU is already in the sales order
        if (allCatalogSku.some((catSku) => salesOrderItems.includes(catSku))) {
            updateLastCatalog(customerId, today);
            return;
        }

        // Get catalogs associated with the items in the sales order
        const catalogsOnSo = getItemCatalogs(salesOrderItems);

        // Exit early if no catalogs are found for the sales order items
        if (catalogsOnSo.size === 0) {
            return;
        }

        // Create a list of catalogs to add to the sales order
        const soCatalogList = Array.from(catalogsOnSo);

        // Add catalogs to the sales order
        addCatalogsToSalesOrder(newRecord, soCatalogList, catalogDictionary);

        // Update the customer's last catalog order date
        updateLastCatalog(customerId, today);
    }

    // Export the beforeSubmit function
    return {
        beforeSubmit: beforeSubmit
    };
});
