import { db } from '../src/lib/db'

async function main() {
  console.log('🌱 Seeding database...\n')

  // Clean existing data (order matters due to relations)
  await db.orderItem.deleteMany()
  await db.order.deleteMany()
  await db.printQueueItem.deleteMany()
  await db.productionItem.deleteMany()
  await db.productVariant.deleteMany()
  await db.product.deleteMany()

  // ──────────────────────────────────────────
  // 1. Products with Variants
  // ──────────────────────────────────────────

  // Helper to create product with variants
  async function createProductWithVariants(
    sku: string,
    name: string,
    minStock: number,
    variants: { color: string; colorHex: string; qty: number; barcode?: string }[]
  ) {
    return db.product.create({
      data: {
        sku,
        name,
        minStock,
        variants: {
          create: variants,
        },
      },
      include: { variants: true },
    })
  }

  const ucs001 = await createProductWithVariants('UCS001', 'Classic Tee', 10, [
    { color: 'White', colorHex: '#dfe6e9', qty: 150, barcode: '8901234001001' },
    { color: 'Black', colorHex: '#2d3436', qty: 200, barcode: '8901234001002' },
    { color: 'Blue', colorHex: '#3498db', qty: 8, barcode: '8901234001003' },
    { color: 'Red', colorHex: '#e74c3c', qty: 75, barcode: '8901234001004' },
    { color: 'Green', colorHex: '#27ae60', qty: 3, barcode: '8901234001005' },
  ])
  console.log(`✅ Created ${ucs001.sku} "${ucs001.name}" with ${ucs001.variants.length} variants`)

  const ucs002 = await createProductWithVariants('UCS002', 'Premium Hoodie', 10, [
    { color: 'Charcoal', colorHex: '#636e72', qty: 4, barcode: '8901234002001' },
    { color: 'Navy', colorHex: '#2c3e50', qty: 2, barcode: '8901234002002' },
    { color: 'Burgundy', colorHex: '#8e2949', qty: 0, barcode: '8901234002003' },
  ])
  console.log(`✅ Created ${ucs002.sku} "${ucs002.name}" with ${ucs002.variants.length} variants`)

  const ucs003 = await createProductWithVariants('UCS003', 'Polo Shirt', 10, [
    { color: 'White', colorHex: '#dfe6e9', qty: 60, barcode: '8901234003001' },
    { color: 'Black', colorHex: '#2d3436', qty: 45, barcode: '8901234003002' },
    { color: 'Navy', colorHex: '#2c3e50', qty: 12 },
    { color: 'Beige', colorHex: '#d4a574', qty: 5 },
  ])
  console.log(`✅ Created ${ucs003.sku} "${ucs003.name}" with ${ucs003.variants.length} variants`)

  const ucs004 = await createProductWithVariants('UCS004', 'Oversized Tee', 10, [
    { color: 'Sage', colorHex: '#87a878', qty: 18, barcode: '8901234004001' },
    { color: 'Lavender', colorHex: '#a29bfe', qty: 5, barcode: '8901234004002' },
    { color: 'Cream', colorHex: '#f5e6ca', qty: 30, barcode: '8901234004003' },
  ])
  console.log(`✅ Created ${ucs004.sku} "${ucs004.name}" with ${ucs004.variants.length} variants`)

  const gd001 = await createProductWithVariants('GD001', 'Abstract Wave Tee', 10, [
    { color: 'Multi-Color', colorHex: '#6c5ce7', qty: 45, barcode: '8901234005001' },
    { color: 'Mono Black', colorHex: '#2d3436', qty: 7, barcode: '8901234005002' },
  ])
  console.log(`✅ Created ${gd001.sku} "${gd001.name}" with ${gd001.variants.length} variants`)

  const gd002 = await createProductWithVariants('GD002', 'Typography Hoodie', 10, [
    { color: 'Black', colorHex: '#2d3436', qty: 4, barcode: '8901234006001' },
    { color: 'White', colorHex: '#dfe6e9', qty: 30, barcode: '8901234006002' },
    { color: 'Grey', colorHex: '#95a5a6', qty: 15, barcode: '8901234006003' },
  ])
  console.log(`✅ Created ${gd002.sku} "${gd002.name}" with ${gd002.variants.length} variants`)

  const gd003 = await createProductWithVariants('GD003', 'Minimalist Line Crewneck', 10, [
    { color: 'Off-White', colorHex: '#f0ede5', qty: 55 },
    { color: 'Sand', colorHex: '#c8b88a', qty: 8 },
  ])
  console.log(`✅ Created ${gd003.sku} "${gd003.name}" with ${gd003.variants.length} variants`)

  const gd004 = await createProductWithVariants('GD004', 'Geometric Print Tee', 10, [
    { color: 'Blue', colorHex: '#74b9ff', qty: 7, barcode: '8901234008001' },
    { color: 'Teal', colorHex: '#1abc9c', qty: 0, barcode: '8901234008002' },
  ])
  console.log(`✅ Created ${gd004.sku} "${gd004.name}" with ${gd004.variants.length} variants`)

  const gd005 = await createProductWithVariants('GD005', 'Vintage Retro Print', 10, [
    { color: 'Brown', colorHex: '#8B6914', qty: 55 },
    { color: 'Olive', colorHex: '#6b8e23', qty: 3 },
  ])
  console.log(`✅ Created ${gd005.sku} "${gd005.name}" with ${gd005.variants.length} variants`)

  const ucs005 = await createProductWithVariants('UCS005', 'Tank Top', 10, [
    { color: 'Coral', colorHex: '#ff7675', qty: 0 },
    { color: 'Sky Blue', colorHex: '#74b9ff', qty: 90, barcode: '8901234010001' },
    { color: 'White', colorHex: '#dfe6e9', qty: 65, barcode: '8901234010002' },
  ])
  console.log(`✅ Created ${ucs005.sku} "${ucs005.name}" with ${ucs005.variants.length} variants`)

  // Fetch all products with variants for reference
  const allProducts = await db.product.findMany({ include: { variants: true } })

  // Helper to find variant by SKU + color
  const findVariantId = (sku: string, color: string) => {
    const p = allProducts.find((p) => p.sku === sku)
    if (!p) throw new Error(`Product ${sku} not found`)
    const v = p.variants.find((v) => v.color === color)
    if (!v) throw new Error(`Variant ${color} not found for ${sku}`)
    return v.id
  }

  // ──────────────────────────────────────────
  // 2. Print Queue Items (link to variantId)
  // ──────────────────────────────────────────
  const printQueueItems = await db.printQueueItem.createMany({
    data: [
      { variantId: findVariantId('UCS001', 'Blue'), qty: 50, status: 'Urgent' },
      { variantId: findVariantId('UCS001', 'Green'), qty: 30, status: 'Priority' },
      { variantId: findVariantId('UCS004', 'Lavender'), qty: 25, status: 'Normal' },
      { variantId: findVariantId('GD001', 'Mono Black'), qty: 15, status: 'Priority' },
      { variantId: findVariantId('UCS005', 'Coral'), qty: 20, status: 'Urgent' },
      { variantId: findVariantId('GD004', 'Teal'), qty: 40, status: 'Normal' },
      { variantId: findVariantId('UCS002', 'Burgundy'), qty: 20, status: 'Normal' },
    ],
  })
  console.log(`✅ Created ${printQueueItems.count} print queue items`)

  // ──────────────────────────────────────────
  // 3. Production Items (link to variantId)
  // ──────────────────────────────────────────
  const productionItems = await db.productionItem.createMany({
    data: [
      { variantId: findVariantId('UCS001', 'White'), qty: 100, assignedTo: 'Printer A - Budi' },
      { variantId: findVariantId('UCS001', 'Black'), qty: 80, assignedTo: 'Printer B - Andi' },
      { variantId: findVariantId('GD001', 'Multi-Color'), qty: 30, assignedTo: 'Printer A - Budi' },
      { variantId: findVariantId('UCS004', 'Cream'), qty: 25, assignedTo: 'Printer C - Sari' },
      { variantId: findVariantId('UCS005', 'Sky Blue'), qty: 50, assignedTo: 'Printer B - Andi' },
    ],
  })
  console.log(`✅ Created ${productionItems.count} production items`)

  // ──────────────────────────────────────────
  // 4. Orders (link order items to variantId)
  // ──────────────────────────────────────────
  const ordersData = [
    {
      orderNo: 'ORD-2024-001', status: 'Completed',
      items: [
        { variantId: findVariantId('UCS001', 'White'), qty: 10 },
        { variantId: findVariantId('UCS001', 'Black'), qty: 5 },
      ],
      date: new Date('2024-10-02T09:15:00.000Z'),
    },
    {
      orderNo: 'ORD-2024-002', status: 'Completed',
      items: [
        { variantId: findVariantId('UCS001', 'Red'), qty: 8 },
        { variantId: findVariantId('UCS005', 'White'), qty: 12 },
      ],
      date: new Date('2024-10-05T14:30:00.000Z'),
    },
    {
      orderNo: 'ORD-2024-003', status: 'Completed',
      items: [
        { variantId: findVariantId('GD001', 'Multi-Color'), qty: 6 },
        { variantId: findVariantId('GD003', 'Off-White'), qty: 4 },
        { variantId: findVariantId('UCS003', 'Navy'), qty: 3 },
      ],
      date: new Date('2024-10-08T11:00:00.000Z'),
    },
    {
      orderNo: 'ORD-2024-004', status: 'Processing',
      items: [
        { variantId: findVariantId('UCS001', 'Blue'), qty: 20 },
        { variantId: findVariantId('UCS004', 'Lavender'), qty: 15 },
      ],
      date: new Date('2024-10-12T08:45:00.000Z'),
    },
    {
      orderNo: 'ORD-2024-005', status: 'Processing',
      items: [
        { variantId: findVariantId('UCS002', 'Charcoal'), qty: 10 },
      ],
      date: new Date('2024-10-15T16:20:00.000Z'),
    },
    {
      orderNo: 'ORD-2024-006', status: 'Pending',
      items: [
        { variantId: findVariantId('GD002', 'Black'), qty: 5 },
        { variantId: findVariantId('GD005', 'Brown'), qty: 8 },
      ],
      date: new Date('2024-10-18T10:00:00.000Z'),
    },
    {
      orderNo: 'ORD-2024-007', status: 'Pending',
      items: [
        { variantId: findVariantId('GD002', 'Grey'), qty: 12 },
        { variantId: findVariantId('UCS004', 'Sage'), qty: 7 },
        { variantId: findVariantId('UCS005', 'Coral'), qty: 5 },
      ],
      date: new Date('2024-10-20T13:15:00.000Z'),
    },
    {
      orderNo: 'ORD-2024-008', status: 'Cancelled',
      items: [
        { variantId: findVariantId('UCS002', 'Navy'), qty: 3 },
      ],
      date: new Date('2024-10-22T09:30:00.000Z'),
    },
    {
      orderNo: 'ORD-2024-009', status: 'Completed',
      items: [
        { variantId: findVariantId('UCS001', 'White'), qty: 25 },
        { variantId: findVariantId('UCS003', 'Beige'), qty: 10 },
        { variantId: findVariantId('GD004', 'Blue'), qty: 8 },
      ],
      date: new Date('2024-10-25T15:45:00.000Z'),
    },
    {
      orderNo: 'ORD-2024-010', status: 'Processing',
      items: [
        { variantId: findVariantId('GD001', 'Multi-Color'), qty: 10 },
        { variantId: findVariantId('GD003', 'Sand'), qty: 6 },
      ],
      date: new Date('2024-10-28T11:30:00.000Z'),
    },
    {
      orderNo: 'ORD-2024-011', status: 'Pending',
      items: [
        { variantId: findVariantId('UCS001', 'Black'), qty: 15 },
        { variantId: findVariantId('UCS001', 'Red'), qty: 10 },
        { variantId: findVariantId('UCS004', 'Sage'), qty: 8 },
      ],
      date: new Date('2024-10-30T08:00:00.000Z'),
    },
    {
      orderNo: 'ORD-2024-012', status: 'Pending',
      items: [
        { variantId: findVariantId('UCS001', 'Blue'), qty: 30 },
        { variantId: findVariantId('UCS005', 'White'), qty: 20 },
      ],
      date: new Date('2024-10-31T14:00:00.000Z'),
    },
  ]

  let orderCount = 0
  for (const orderData of ordersData) {
    await db.order.create({
      data: {
        orderNo: orderData.orderNo,
        status: orderData.status,
        createdAt: orderData.date,
        updatedAt: orderData.date,
        orderItems: {
          create: orderData.items.map((item) => ({
            variantId: item.variantId,
            qty: item.qty,
            createdAt: orderData.date,
          })),
        },
      },
    })
    orderCount++
  }
  console.log(`✅ Created ${orderCount} orders with items`)

  // ──────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────
  const allVariants = await db.productVariant.findMany({ include: { product: true } })
  const lowStockVariants = allVariants.filter((v) => v.qty < v.product.minStock)
  const outOfStockVariants = allVariants.filter((v) => v.qty === 0)
  const noBarcodeVariants = allVariants.filter((v) => !v.barcode)

  console.log('\n📊 Database Summary:')
  console.log(`   Products: ${await db.product.count()}`)
  console.log(`   Variants: ${allVariants.length}`)
  console.log(`   Low Stock Variants: ${lowStockVariants.length}`)
  console.log(`   Out of Stock Variants: ${outOfStockVariants.length}`)
  console.log(`   No Barcode Variants: ${noBarcodeVariants.length}`)
  console.log(`   Print Queue Items: ${await db.printQueueItem.count()}`)
  console.log(`   Production Items: ${await db.productionItem.count()}`)
  console.log(`   Orders: ${await db.order.count()}`)
  console.log('\n🎉 Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
