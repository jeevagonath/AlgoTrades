-- Add order_action to order_book so we can flag ENTRY vs EXIT orders
ALTER TABLE order_book
ADD COLUMN IF NOT EXISTS order_action TEXT DEFAULT 'ENTRY';

-- Optional index for faster filtering by action
CREATE INDEX IF NOT EXISTS idx_order_book_action ON order_book(order_action);
