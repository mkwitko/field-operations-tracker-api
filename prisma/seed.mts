import { faker } from '@faker-js/faker';
import { PrismaClient } from "@prisma/client";


const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Iniciando seed...");

  // // === 1. Buscar regiões existentes ===
  // const regioes = await prisma.regioes.findMany();
  // if (regioes.length === 0) {
  //   throw new Error(
  //     "Nenhuma região encontrada. Crie as regiões antes de rodar o seed."
  //   );
  // }
  // console.log(`🗺️ Encontradas ${regioes.length} regiões.`);

  // // === 2. Criar núcleos por região ===
  // for (const regiao of regioes) {
  //   await prisma.nucleos.create({
  //     data: {
  //       nome: `Núcleo ${regiao.nome}`,
  //       regioesId: regiao.id,
  //     },
  //   });
  // }

  // console.log("✅ Núcleos criados!");

  // === 3. Criar sessões e preparos com dados variados ===
  const nucleos = await prisma.nucleos.findMany();

  for (const nucleo of nucleos) {
    console.log(`→ Populando ${nucleo.nome}...`);

    // --- Sessões ---
    const numSessoes = faker.number.int({ min: 2, max: 5 });
    for (let i = 1; i <= numSessoes; i++) {
      const dataSessao = faker.date.recent({ days: 90 });
      await prisma.sessoes.create({
        data: {
          sessao: faker.helpers.arrayElement(["escala", "escala_anual", "sessao_instrutiva", "casal", "qm"]),
          descricao: faker.lorem.sentence(),
          pessoas: `${faker.number.int({ min: 10, max: 40 })}`,
          data: dataSessao.toISOString(),
          quantidadeVegetal: `${faker.number.int({ min: 5, max: 30 })}`,
          nucleosId: nucleo.id,
        },
      });
    }

    // --- Preparos ---
    const numPreparos = faker.number.int({ min: 1, max: 3 });
    for (let j = 1; j <= numPreparos; j++) {
      // Criar dados relacionados primeiro
      const mariri = await prisma.mariri.create({
        data: {
          pesoKg: faker.number.int({ min: 10, max: 30 }).toString(),
          unidades: faker.number.int({ min: 3, max: 10 }).toString(),
          tipo: faker.helpers.arrayElement(["Caupuri, Tucunaca"]),
          tipoPlantacao: faker.helpers.arrayElement(["Nativo", "Plantado"]),
          origemMensagem: faker.location.city(),
        },
      });

      const chacrona = await prisma.chacrona.create({
        data: {
          pesoKg: faker.number.int({ min: 5, max: 20 }).toString(),
          unidades: faker.number.int({ min: 50, max: 200 }).toString(),
          tipoPlantacao: faker.helpers.arrayElement(["Nativo", "Plantado"]),
          origemMensagem: faker.location.city(),
        },
      });

      const lenha = await prisma.lenha.create({
        data: {
          quantidadeM2: faker.number.int({ min: 2, max: 10 }).toString(),
          tempoFornalhaAcesa: `${faker.number.int({ min: 3, max: 12 })}`,
          tipoLenha: faker.helpers.arrayElement([
            "Eucalipto",
            "Cambuí",
            "Misto",
          ]),
          tipoFornalha: faker.helpers.arrayElement([
            "Convencional",
            "Fornalha",
          ]),
        },
      });

      const inicio = faker.date.recent({ days: 120 });
      const fim = faker.date.soon({
        days: faker.number.int({ min: 1, max: 7 }),
        refDate: inicio,
      });

      await prisma.preparos.create({
        data: {
          inicio,
          fim,
          producaoLitros: `${faker.number.int({ min: 20, max: 100 })}`,
          nucleosId: nucleo.id,
          maririId: mariri.id,
          chacronaId: chacrona.id,
          lenhaId: lenha.id,
        },
      });
    }
  }

  console.log("✅ Sessões, preparos e insumos criados com sucesso!");
  console.log("🌱 Seed finalizado com sucesso!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Erro ao executar seed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
