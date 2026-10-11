if (Number(process.versions.node.split('.')[0]) !== 22) {
  throw new Error(`Este projeto exige Node 22; atual: ${process.versions.node}`);
}
