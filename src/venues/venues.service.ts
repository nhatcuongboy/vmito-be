import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';

@Injectable()
export class VenuesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.venue.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.venue.findUnique({
      where: { id },
    });
  }

  async create(createVenueDto: CreateVenueDto) {
    return this.prisma.venue.create({
      data: createVenueDto,
    });
  }

  async update(id: string, updateVenueDto: UpdateVenueDto) {
    return this.prisma.venue.update({
      where: { id },
      data: updateVenueDto,
    });
  }

  async remove(id: string) {
    return this.prisma.venue.delete({
      where: { id },
    });
  }
}
