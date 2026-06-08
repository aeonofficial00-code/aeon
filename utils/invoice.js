const PDFDocument = require('pdfkit');

function generateInvoicePdf(order, res) {
    const doc = new PDFDocument({ margin: 50 });
    
    // Pipe the PDF document to the response
    doc.pipe(res);
    
    // Header
    doc.fillColor('#C9A96E')
       .fontSize(24)
       .text('AEONV', { align: 'center' });
       
    doc.fillColor('#888888')
       .fontSize(10)
       .text('Official AeonV Store', { align: 'center' })
       .text('Email: hello@aeonv.in', { align: 'center' })
       .moveDown();
       
    doc.fillColor('#333333')
       .fontSize(20)
       .text('INVOICE', { align: 'center' })
       .moveDown();

    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#dddddd').stroke().moveDown();

    // Order info
    const top = doc.y;
    doc.fontSize(10)
       .text(`Order ID: ${order.id}`)
       .text(`Date: ${new Date(order.created_at).toLocaleString('en-IN')}`)
       .text(`Status: ${(order.status || '').toUpperCase()}`)
       .text(`Payment ID: ${order.razorpay_payment_id || 'N/A'}`);

    doc.text(`Billed To:`, 300, top)
       .text(order.address.name, 300, top + 15)
       .text(order.address.line1, 300, top + 30)
       .text(`${order.address.city}, ${order.address.state} ${order.address.pincode}`, 300, top + 45)
       .text(`Phone: ${order.address.phone}`, 300, top + 60);
       
    doc.moveDown(3);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#dddddd').stroke().moveDown();

    // Table Header
    doc.font('Helvetica-Bold')
       .text('Item', 50, doc.y)
       .text('Qty', 350, doc.y)
       .text('Price', 400, doc.y)
       .text('Total', 480, doc.y);
       
    doc.moveTo(50, doc.y + 15).lineTo(550, doc.y + 15).stroke().moveDown(1.5);

    // Items
    doc.font('Helvetica');
    let items = [];
    try {
        items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    } catch(e) {}

    items.forEach(item => {
        let y = doc.y;
        let itemName = item.name;
        if (item.selectedSize) itemName += ` (Size: ${item.selectedSize})`;
        if (item.selectedColor) itemName += ` (Color: ${item.selectedColor})`;
        
        doc.text(itemName, 50, y, { width: 280 })
           .text(item.qty.toString(), 350, y)
           .text(`Rs. ${item.price}`, 400, y)
           .text(`Rs. ${item.price * item.qty}`, 480, y);
           
        doc.moveDown(0.5);
    });

    doc.moveTo(50, doc.y + 10).lineTo(550, doc.y + 10).stroke().moveDown(2);

    // Totals
    const totalsTop = doc.y;
    doc.font('Helvetica-Bold')
       .text('Subtotal:', 380, totalsTop)
       .text(`Rs. ${order.subtotal}`, 480, totalsTop);
       
    doc.font('Helvetica')
       .text('Delivery:', 380, totalsTop + 15)
       .text(`Rs. ${order.delivery_charge}`, 480, totalsTop + 15);
       
    doc.font('Helvetica-Bold')
       .text('Grand Total:', 380, totalsTop + 35)
       .text(`Rs. ${order.total}`, 480, totalsTop + 35);

    doc.moveTo(350, totalsTop + 30).lineTo(550, totalsTop + 30).strokeColor('#dddddd').stroke();

    // Footer
    doc.moveDown(5);
    doc.font('Helvetica-Oblique')
       .fillColor('#888888')
       .fontSize(10)
       .text('Thank you for shopping with AEONV.', { align: 'center' });

    doc.end();
}

module.exports = { generateInvoicePdf };
