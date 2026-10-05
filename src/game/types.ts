export type GameItem = {
  _id: string
  name: string
  customId: string
}

export type RoundRow = {
  hint: string
  item: GameItem
}

export type Round = {
  _id: string
  title: string
  items: RoundRow[]
  isEnabled: boolean
}

export type RegisterSuccess = {
  username: string
  playToken: string
}

export type CompleteSuccess = {
  username: string
  finishTime: string
  completionDuration: number
}
