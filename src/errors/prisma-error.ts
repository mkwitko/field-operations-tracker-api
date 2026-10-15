export class PrismaError extends Error {
  constructor(message?: string) {
    super(message || 'Prisma Error')
    this.name = 'PrismError'
  }
}
