import { defineStore } from 'pinia'

export type ApplicationStage = 'Bookmarked' | 'Applied' | 'Interviewing' | 'Offered' | 'Rejected'

export interface PipelineCard {
  id: string
  companyName: string
  stage: ApplicationStage
}

export const usePipelineStore = defineStore('pipeline', {
  state: () => ({
    cards: [] as PipelineCard[]
  }),
  actions: {
    seed() {
      if (this.cards.length > 0) {
        return
      }

      this.cards = [
        { id: '1', companyName: 'Example IND Sponsor BV', stage: 'Bookmarked' }
      ]
    }
  }
})
