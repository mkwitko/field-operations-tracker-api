import { describe, expect, it } from "vitest";
import { acessoLiberado } from "./acesso-liberado";

const semAcesso = {
  grau: null,
  cargos: null,
  cargoCodigo: null,
  bypass: false,
};

describe("acessoLiberado", () => {
  it("nega quem não tem cargo nem grau", () => {
    expect(acessoLiberado(semAcesso)).toBe(false);
  });

  it("libera grau QM sem cargo", () => {
    expect(acessoLiberado({ ...semAcesso, grau: "QM" })).toBe(true);
  });

  it("libera cargo LOCAL, que não concede nenhuma permissão", () => {
    // Cargo 56 = MONITOR(A) DO PLANTIO LOCAL, escopo LOCAL, ESCOPO_PERMISSOES.LOCAL = []
    expect(acessoLiberado({ ...semAcesso, cargoCodigo: "56" })).toBe(true);
  });

  it("libera bypass mesmo sem cargo e sem grau", () => {
    expect(acessoLiberado({ ...semAcesso, bypass: true })).toBe(true);
  });

  it("aceita cargos vindos em texto separado por vírgula", () => {
    expect(
      acessoLiberado({ ...semAcesso, cargos: "PRESIDENTE LOCAL" }),
    ).toBe(true);
  });
});
