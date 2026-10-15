-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "onchainId" INTEGER,
    "clientAddress" TEXT NOT NULL,
    "providerAddress" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "criteria" TEXT[],
    "category" TEXT NOT NULL,
    "amountUnits" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "specHash" TEXT NOT NULL,
    "specJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "verifierAddress" TEXT,
    "reviewEnds" TIMESTAMP(3),
    "feeBps" INTEGER,
    "createdTx" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "deliveryHash" TEXT NOT NULL,
    "recordJson" TEXT NOT NULL,
    "number" INTEGER,
    "submittedTx" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verdict" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliveryNumber" INTEGER NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "summary" TEXT NOT NULL,
    "checks" JSONB NOT NULL,
    "model" TEXT,
    "reasonHash" TEXT NOT NULL,
    "reportJson" TEXT NOT NULL,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verdict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_onchainId_key" ON "Order"("onchainId");
CREATE UNIQUE INDEX "Order_specHash_key" ON "Order"("specHash");
CREATE INDEX "Order_clientAddress_idx" ON "Order"("clientAddress");
CREATE INDEX "Order_providerAddress_idx" ON "Order"("providerAddress");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE UNIQUE INDEX "Delivery_deliveryHash_key" ON "Delivery"("deliveryHash");
CREATE INDEX "Delivery_orderId_idx" ON "Delivery"("orderId");
CREATE UNIQUE INDEX "Verdict_reasonHash_key" ON "Verdict"("reasonHash");
CREATE INDEX "Verdict_orderId_idx" ON "Verdict"("orderId");
CREATE UNIQUE INDEX "OrderEvent_txHash_logIndex_key" ON "OrderEvent"("txHash", "logIndex");
CREATE INDEX "OrderEvent_orderId_idx" ON "OrderEvent"("orderId");

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Verdict" ADD CONSTRAINT "Verdict_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
