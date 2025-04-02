import { ccc } from "@ckb-ccc/shell";

import { Cell as LumosCell } from "@ckb-lumos/base";
import { UnpackResult } from "@ckb-lumos/codec";

import {
  Action,
  assembleCobuildWitnessLayout,
  assembleCreateClusterAction,
  assembleCreateSporeAction,
  assembleTransferClusterAction,
  assembleTransferSporeAction,
} from "@spore-sdk/core/lib/cobuild/index.js";

export const generateClusterCreateCoBuild = (
  clusterOutput: ccc.CellOutput,
  clusterOutputData: string,
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
  cellOutput: ccc.CellOutput,
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
      "The length of spore outputs and spore cell data are not same",
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
    clusterOutput,
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
  outputCells: ccc.CellOutput[],
): string => {
  if (sporeCells.length !== outputCells.length) {
    throw new Error(
      "The length of spore input cells and spore output cells are not same",
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
  tx: ccc.Transaction,
  index: number,
  client: ccc.Client,
): Promise<void> => {
  const cobuild = generateClusterCreateCoBuild(
    tx.outputs[index],
    tx.outputsData[index],
  ) as ccc.Hex;
  tx.witnesses.push(cobuild);

  await prepareFeeWitness(tx, client);
};

export const insertSporeCreationWitness = async (
  tx: ccc.Transaction,
  inputClusterIndex: number,
  outputClusterIndex: number,
  outputSporeIndices: number[],
  client: ccc.Client,
): Promise<void> => {
  const clusterInput = tx.inputs[inputClusterIndex];
  await clusterInput.completeExtraInfos(client);
  const clusterId = clusterInput.cellOutput!.type!.args;
  console.log("clusterId", clusterId);

  const cobuild = generateSporeCreateCoBuild({
    sporeOutputs: tx.outputs.filter((_, index) =>
      outputSporeIndices.includes(index),
    ),
    sporeOutputsData: tx.outputsData.filter((_, index) =>
      outputSporeIndices.includes(index),
    ),
    clusterCell: (await ccc.spore.assertCluster(client, clusterId)).cell,
    clusterOutputCell: tx.outputs[outputClusterIndex],
  }) as ccc.Hex;
  tx.witnesses.push(cobuild);

  await prepareFeeWitness(tx, client);
};

export const insertSporeTransferWitness = async (
  tx: ccc.Transaction,
  inputSporeIndex: number,
  outputSporeIndex: number,
  client: ccc.Client,
): Promise<void> => {
  const sporeInput = tx.inputs[inputSporeIndex];
  await sporeInput.completeExtraInfos(client);
  const sporeTypeArgs = sporeInput.cellOutput!.type!.args;
  console.log("sporeTypeArgs", sporeTypeArgs);
  const cobuild = generateSporeTransferCoBuild(
    [(await ccc.spore.assertSpore(client, sporeTypeArgs)).cell],
    [tx.outputs[outputSporeIndex]],
  ) as ccc.Hex;
  tx.witnesses.push(cobuild);

  await prepareFeeWitness(tx, client);
};

export async function prepareFeeWitness(
  tx: ccc.Transaction,
  client: ccc.Client,
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
