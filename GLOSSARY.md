# Factory Inventory

Tracks stock across warehouses, the customer orders that draw it down, and the restocking that replenishes it.

## Language

### Selling

**Order**:
A customer's request to buy items from the factory, fulfilled from a warehouse.
_Avoid_: Sales order, customer order (when "Order" alone is unambiguous)

### Restocking

**Restock Order**:
A request placed with a supplier to replenish inventory items at exactly one warehouse, constrained by a budget.
_Avoid_: Purchase order, submitted order, order (unqualified)

**Reorder Point**:
The on-hand quantity at or below which an inventory item needs restocking.
_Avoid_: Minimum stock, threshold

**Restock Candidate**:
An inventory item whose on-hand quantity is below 1.5x its Reorder Point and that has no open Restock Order.
_Avoid_: Low-stock item, recommendation

**Lead Time**:
The number of days between placing a Restock Order and its arrival at the warehouse.
_Avoid_: Delivery time, turnaround
