import { ccc } from "@ckb-ccc/shell";

import { Cell as LumosCell } from "@ckb-lumos/base";
import { UnpackResult } from "@ckb-lumos/codec";

import {
  Action,
  assembleTransferSporeAction,
  assembleCobuildWitnessLayout,
  assembleCreateClusterAction,
  assembleCreateSporeAction,
  assembleTransferClusterAction,
} from "@spore-sdk/core/lib/cobuild/index.js";

export const generateClusterCreateCoBuild = (
  clusterOutput: ccc.CellOutput,
  clusterOutputData: string
): string => {
  const output = {
    cellOutput: convertCellOutput(clusterOutput),
    data: clusterOutputData,
  } as LumosCell;
  const { actions } = assembleCreateClusterAction(output);
  return assembleCobuildWitnessLayout(actions);
};

// convert ckb-ccc.CellOutput to CKBComponents.CellOutput
function convertCellOutput(
  cellOutput: ccc.CellOutput
): CKBComponents.CellOutput {
  return {
    capacity: cellOutput.capacity.toString(),
    lock: cellOutput.lock,
    type: cellOutput.type,
  };
}

export const generateSporeCreateCoBuild = ({
  sporeOutputs,
  sporeOutputsData,
  clusterCell,
  clusterOutputCell,
}: {
  sporeOutputs: ccc.CellOutput[];
  sporeOutputsData: ccc.Hex[];
  clusterCell: ccc.Cell;
  clusterOutputCell: ccc.CellOutput;
}): string => {
  if (sporeOutputs.length !== sporeOutputsData.length) {
    throw new Error(
      "The length of spore outputs and spore cell data are not same"
    );
  }
  let sporeActions: UnpackResult<typeof Action>[] = [];

  // cluster transfer actions
  const clusterInput = {
    cellOutput: convertCellOutput(clusterCell.cellOutput),
    data: clusterCell.outputData,
  } as LumosCell;
  const clusterOutput = {
    cellOutput: convertCellOutput(clusterOutputCell),
    data: clusterCell.outputData,
  } as LumosCell;
  const { actions } = assembleTransferClusterAction(
    clusterInput,
    clusterOutput
  );
  sporeActions = sporeActions.concat(actions);

  // spores create actions
  for (let index = 0; index < sporeOutputs.length; index++) {
    const sporeOutput = {
      cellOutput: convertCellOutput(sporeOutputs[index]),
      data: sporeOutputsData[index],
    } as LumosCell;
    const { actions } = assembleCreateSporeAction(sporeOutput);
    sporeActions = sporeActions.concat(actions);
  }
  return assembleCobuildWitnessLayout(sporeActions);
};

export const generateSporeTransferCoBuild = (
  sporeCells: ccc.Cell[],
  outputCells: ccc.CellOutput[]
): string => {
  if (sporeCells.length !== outputCells.length) {
    throw new Error(
      "The length of spore input cells and spore output cells are not same"
    );
  }
  let sporeActions: UnpackResult<typeof Action>[] = [];
  for (let index = 0; index < sporeCells.length; index++) {
    const sporeCell = sporeCells[index];
    const outputData = sporeCell.outputData;
    const sporeInput = {
      cellOutput: convertCellOutput(sporeCells[index].cellOutput),
      data: outputData,
    } as LumosCell;
    const sporeOutput = {
      cellOutput: convertCellOutput(outputCells[index]),
      data: outputData,
    } as LumosCell;
    const { actions } = assembleTransferSporeAction(sporeInput, sporeOutput);
    sporeActions = sporeActions.concat(actions);
  }
  return assembleCobuildWitnessLayout(sporeActions);
};

export const insertClusterCreationWitness = async (
  tx_: ccc.Transaction,
  client: ccc.Client
): Promise<ccc.Transaction> => {
  const tx = tx_.clone();

  const cobuild = generateClusterCreateCoBuild(
    tx.outputs[0],
    tx.outputsData[0]
  ) as ccc.Hex;
  tx.witnesses.push(cobuild);

  await prepareFeeWitness(tx, client);

  return tx;
};

export const insertSporeCreationWitness = async (
  tx_: ccc.Transaction,
  clusterCell: ccc.Cell,
  client: ccc.Client
): Promise<ccc.Transaction> => {
  const tx = tx_.clone();

  const cobuild = generateSporeCreateCoBuild({
    sporeOutputs: tx.outputs.slice(1, tx.outputs.length),
    sporeOutputsData: tx.outputsData.slice(1, tx.outputsData.length),
    clusterCell,
    clusterOutputCell: tx.outputs[0],
  }) as ccc.Hex;
  tx.witnesses.push(cobuild);

  await prepareFeeWitness(tx, client);

  return tx;
};

export const insertSporeTransferWitness = async (
  tx_: ccc.Transaction,
  sporeTypeArgs: string,
  client: ccc.Client
): Promise<ccc.Transaction> => {
  const tx = tx_.clone();

  const cobuild = generateSporeTransferCoBuild(
    [(await ccc.spore.assertSpore(client, sporeTypeArgs)).cell],
    tx.outputs.slice(0, 1)
  ) as ccc.Hex;
  tx.witnesses.push(cobuild);

  await prepareFeeWitness(tx, client);

  return tx;
};

export async function prepareFeeWitness(
  tx: ccc.Transaction,
  client: ccc.Client
): Promise<void> {
  const minFee = tx.estimateFee(1000);
  const inputCapacity = await tx.getInputsCapacity(client);
  const outputCapacity = tx.getOutputsCapacity();

  if (inputCapacity - outputCapacity - minFee < 0) {
    console.log("has cobuild witness, extra fee input is needed");
    // insert a 0x witness at the last but one position
    tx.witnesses.splice(tx.witnesses.length - 1, 0, "0x");
  }
}
