# Sales Order Catalog Updater

This is a NetSuite User Event Script that updates sales orders with catalogs based on certain criteria and updates the customer record with the date of the last catalog order. 

## Functionality

This script performs the following actions:

- Runs on creation of a new sales order.
- Checks if the script should run based on the sales order's subtotal, sales rep, and shipping method.
- Retrieves customer information and calculates the days since the last catalog was sent.
- Determines if the customer should be skipped based on their name, days since last catalog, and a custom flag indicating if the customer should not receive catalogs.
- Retrieves catalog information from the system.
- Retrieves item information from the sales order.
- Gets the catalogs associated with the items in the sales order.
- Adds catalogs to the sales order based on the catalog list.
- Updates the customer's last catalog order date.

## How to Use

To use this script, deploy it to your NetSuite environment as a User Event script.

The script should be triggered on the 'beforeSubmit' event of the 'Sales Order' record type.

Please note that you may need to customize the script to fit your specific business requirements.

##Setup
- Create a new list for catalogs with the following custom attributes
 - "_cat_prod_id"
 - "_min_price"
- Create a new item field called: "_catalog_field"
 - Validate the field uses the new catalog list

## Customization

The script contains several constants that can be adjusted to fit your business needs:

- `validSalesRepIds`: Array of sales rep ids for whom the script should run.
- `minOrderTotal`: The minimum order total for the script to run.
- `validShipMethods`: Array of shipping method ids for which the script should run.
- `maxDaysSinceLastCatalog`: Maximum days since the last catalog was sent to a customer.

Please modify these constants as needed.

## Dependencies

This script depends on the following NetSuite modules:

- `N/record`
- `N/search`
- `N/format`
- `N/log`

## Support

For support or any questions regarding this script, please contact the author or raise an issue on the GitHub repository where this script is hosted.

## Contributing

Contributions are welcome. Please submit a pull request with your proposed changes.

## License

This script is released under the [MIT License](https://opensource.org/licenses/MIT).
