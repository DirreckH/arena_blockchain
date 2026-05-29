import { Controller, Get, Param } from "@nestjs/common";

import { Public } from "../common/decorators/public.decorator";
import { PublicDiscoveryService } from "./services/public-discovery.service";

@Public()
@Controller("arena/public/discovery")
export class ArenaPublicDiscoveryController {
  constructor(private readonly discovery: PublicDiscoveryService) {}

  private toCategoryPathname(slug: string) {
    switch (slug) {
      case "sports-live":
        return "/zh/sports/live";
      default:
        return `/zh/${slug}`;
    }
  }

  @Get("home")
  getHome() {
    return this.discovery.getHome();
  }

  @Get("rankings/:kind")
  getRanking(@Param("kind") kind: "hot" | "breaking") {
    return this.discovery.getRanking(kind);
  }

  @Get("latest-topics")
  getLatestTopics() {
    return this.discovery.getLatestTopics();
  }

  @Get("closing-soon")
  getClosingSoon() {
    return this.discovery.getClosingSoon();
  }

  @Get("categories")
  getCategoryDirectoryIndex() {
    return this.discovery.getCategoryDirectoryIndex();
  }

  @Get("categories/:slug")
  getCategoryDirectory(@Param("slug") slug: string) {
    return this.discovery.getCategoryDirectory(this.toCategoryPathname(slug));
  }
}
