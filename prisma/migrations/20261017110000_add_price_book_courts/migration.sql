-- CreateTable
CREATE TABLE "_VenueCourtToVenuePriceBook" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_VenueCourtToVenuePriceBook_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_VenueCourtToVenuePriceBook_B_index" ON "_VenueCourtToVenuePriceBook"("B");

-- AddForeignKey
ALTER TABLE "_VenueCourtToVenuePriceBook" ADD CONSTRAINT "_VenueCourtToVenuePriceBook_A_fkey" FOREIGN KEY ("A") REFERENCES "venue_courts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_VenueCourtToVenuePriceBook" ADD CONSTRAINT "_VenueCourtToVenuePriceBook_B_fkey" FOREIGN KEY ("B") REFERENCES "venue_price_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
