#!/usr/bin/env node

import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {CallToolRequestSchema, ListToolsRequestSchema,} from "@modelcontextprotocol/sdk/types.js";
import fetch from 'node-fetch';

// Halo API配置
class HaloConfig {
    constructor() {
        this.baseUrl = process.env.HALO_BASE_URL || 'http://localhost:8090';
        this.apiUrl = `${this.baseUrl}/api/v1alpha1`;
        this.consoleApiUrl = `${this.baseUrl}/apis/api.console.halo.run/v1alpha1`;
        this.token = process.env.HALO_TOKEN || '';
    }

    getHeaders() {
        return {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
        };
    }
}

class HaloAPIClient {
    constructor(config) {
        this.config = config;
    }

    async request(endpoint, method = 'GET', data = null) {
        const url = endpoint.startsWith('/apis/') ?
            `${this.config.baseUrl}${endpoint}` :
            `${this.config.apiUrl}${endpoint}`;

        const options = {
            method,
            headers: this.config.getHeaders(),
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);

        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    // 获取所有标签
    async getTags() {
        return this.request('/apis/content.halo.run/v1alpha1/tags');
    }

    // 获取所有分类
    async getCategories() {
        return this.request('/apis/content.halo.run/v1alpha1/categories');
    }

    // 创建标签
    async createTag(name, slug = null) {
        const tagData = {
            spec: {
                displayName: name,
                slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
                color: '#ffffff',
                cover: ''
            },
            apiVersion: 'content.halo.run/v1alpha1',
            kind: 'Tag',
            metadata: {
                name: slug || name.toLowerCase().replace(/\s+/g, '-'),
                generateName: 'tag-'
            }
        };

        return this.request('/apis/content.halo.run/v1alpha1/tags', 'POST', tagData);
    }

    // 创建分类
    async createCategory(name, slug = null, description = '') {
        const categoryData = {
            spec: {
                displayName: name,
                slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
                description: description,
                cover: '',
                template: '',
                priority: 0,
                children: []
            },
            apiVersion: 'content.halo.run/v1alpha1',
            kind: 'Category',
            metadata: {
                name: slug || name.toLowerCase().replace(/\s+/g, '-'),
                generateName: 'category-'
            }
        };

        return this.request('/apis/content.halo.run/v1alpha1/categories', 'POST', categoryData);
    }

    // 发布文章
    async publishPost(postData) {
        // 首先创建文章
        const post = await this.request('/apis/content.halo.run/v1alpha1/posts', 'POST', postData);

        // 然后发布文章
        const publishData = {
            spec: {
                releaseSnapshot: post.spec.headSnapshot,
                headSnapshot: post.spec.headSnapshot
            }
        };

        await this.request(`/apis/content.halo.run/v1alpha1/posts/${post.metadata.name}`, 'PUT', {
            ...post,
            spec: {
                ...post.spec,
                publish: true,
                publishTime: new Date().toISOString()
            }
        });

        return post;
    }
}

class ContentAnalyzer {
    constructor(haloClient) {
        this.haloClient = haloClient;
    }

    // 从内容中提取关键词作为潜在标签
    extractKeywords(content) {
        // 简单的关键词提取逻辑
        const text = content.replace(/<[^>]*>/g, ''); // 移除HTML标签
        const words = text.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/g) || [];

        // 统计词频
        const frequency = {};
        words.forEach(word => {
            frequency[word] = (frequency[word] || 0) + 1;
        });

        // 返回频率最高的关键词
        return Object.entries(frequency)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 8)
            .map(([word]) => word);
    }

    // 根据内容推断分类
    inferCategory(title, content) {
        const text = (title + ' ' + content).toLowerCase();

        const categoryKeywords = {
            '技术': ['javascript', 'python', 'java', 'react', 'vue', '编程', '开发', '代码', 'api', '算法'],
            '生活': ['生活', '日常', '感悟', '随笔', '心情', '体验'],
            '学习': ['学习', '教程', '笔记', '总结', '经验', '分享'],
            '工具': ['工具', '软件', '应用', '效率', '推荐'],
            '思考': ['思考', '观点', '看法', '理解', '感想']
        };

        for (const [category, keywords] of Object.entries(categoryKeywords)) {
            if (keywords.some(keyword => text.includes(keyword))) {
                return category;
            }
        }

        return '默认';
    }

    // 智能生成标签和分类
    async generateTagsAndCategories(title, content) {
        const [existingTags, existingCategories] = await Promise.all([
            this.haloClient.getTags(),
            this.haloClient.getCategories()
        ]);

        // 提取关键词
        const keywords = this.extractKeywords(title + ' ' + content);

        // 匹配现有标签
        const matchedTags = [];
        const existingTagNames = existingTags.items.map(tag => tag.spec.displayName.toLowerCase());

        for (const keyword of keywords) {
            const matchedTag = existingTags.items.find(tag =>
                tag.spec.displayName.toLowerCase().includes(keyword.toLowerCase()) ||
                keyword.toLowerCase().includes(tag.spec.displayName.toLowerCase())
            );

            if (matchedTag) {
                matchedTags.push(matchedTag.metadata.name);
            }
        }

        // 如果匹配的标签少于3个，创建新标签
        const newTags = [];
        if (matchedTags.length < 3) {
            const remainingKeywords = keywords.slice(0, 5 - matchedTags.length);
            for (const keyword of remainingKeywords) {
                if (!existingTagNames.includes(keyword.toLowerCase())) {
                    try {
                        const newTag = await this.haloClient.createTag(keyword);
                        newTags.push(newTag.metadata.name);
                    } catch (error) {
                        console.warn(`创建标签 ${keyword} 失败:`, error.message);
                    }
                }
            }
        }

        // 推断分类
        const inferredCategoryName = this.inferCategory(title, content);
        let categoryName = null;

        const existingCategory = existingCategories.items.find(cat =>
            cat.spec.displayName === inferredCategoryName
        );

        if (existingCategory) {
            categoryName = existingCategory.metadata.name;
        } else {
            try {
                const newCategory = await this.haloClient.createCategory(inferredCategoryName);
                categoryName = newCategory.metadata.name;
            } catch (error) {
                console.warn(`创建分类 ${inferredCategoryName} 失败:`, error.message);
            }
        }

        return {
            tags: [...matchedTags, ...newTags],
            categories: categoryName ? [categoryName] : []
        };
    }
}

class HaloMCPServer {
    constructor() {
        this.server = new Server(
            {
                name: "halo-blog-publisher",
                version: "1.0.0",
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.config = new HaloConfig();
        this.haloClient = new HaloAPIClient(this.config);
        this.contentAnalyzer = new ContentAnalyzer(this.haloClient);

        this.setupToolHandlers();
    }

    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: "publish_post",
                    description: "发布文章到Halo博客，自动生成标签和分类",
                    inputSchema: {
                        type: "object",
                        properties: {
                            title: {
                                type: "string",
                                description: "文章标题"
                            },
                            content: {
                                type: "string",
                                description: "文章内容(支持Markdown)"
                            },
                            excerpt: {
                                type: "string",
                                description: "文章摘要(可选)"
                            },
                            slug: {
                                type: "string",
                                description: "文章别名(可选，用于URL)"
                            },
                            tags: {
                                type: "array",
                                items: {type: "string"},
                                description: "指定标签(可选，不指定将自动生成)"
                            },
                            categories: {
                                type: "array",
                                items: {type: "string"},
                                description: "指定分类(可选，不指定将自动生成)"
                            },
                            allowComment: {
                                type: "boolean",
                                description: "是否允许评论",
                                default: true
                            },
                            pinned: {
                                type: "boolean",
                                description: "是否置顶",
                                default: false
                            }
                        },
                        required: ["title", "content"]
                    }
                },
                {
                    name: "list_tags",
                    description: "获取所有标签列表",
                    inputSchema: {
                        type: "object",
                        properties: {}
                    }
                },
                {
                    name: "list_categories",
                    description: "获取所有分类列表",
                    inputSchema: {
                        type: "object",
                        properties: {}
                    }
                }
            ]
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            switch (request.params.name) {
                case "publish_post":
                    return this.handlePublishPost(request.params.arguments);
                case "list_tags":
                    return this.handleListTags();
                case "list_categories":
                    return this.handleListCategories();
                default:
                    throw new Error(`未知工具: ${request.params.name}`);
            }
        });
    }

    async handlePublishPost(args) {
        try {
            const {title, content, excerpt, slug, allowComment = true, pinned = false} = args;
            let {tags, categories} = args;

            // 如果没有指定标签和分类，自动生成
            if (!tags || tags.length === 0 || !categories || categories.length === 0) {
                const generated = await this.contentAnalyzer.generateTagsAndCategories(title, content);
                tags = tags || generated.tags;
                categories = categories || generated.categories;
            }

            // 构建文章数据
            const postSlug = slug || title.toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-')
                .substring(0, 50);

            const postData = {
                spec: {
                    title: title,
                    slug: postSlug,
                    template: '',
                    cover: '',
                    deleted: false,
                    publish: false,
                    publishTime: null,
                    pinned: pinned,
                    allowComment: allowComment,
                    visible: 'PUBLIC',
                    priority: 0,
                    excerpt: {
                        autoGenerate: !excerpt,
                        raw: excerpt || ''
                    },
                    tags: tags,
                    categories: categories,
                    headSnapshot: '',
                    baseSnapshot: '',
                    owner: ''
                },
                apiVersion: 'content.halo.run/v1alpha1',
                kind: 'Post',
                metadata: {
                    name: postSlug,
                    generateName: 'post-'
                }
            };

            // 创建文章内容快照
            const snapshotData = {
                spec: {
                    subjectRef: {
                        kind: 'Post',
                        name: postSlug
                    },
                    rawType: 'markdown',
                    rawPatch: content,
                    contentPatch: content,
                    parentSnapshotName: '',
                    owner: ''
                },
                apiVersion: 'content.halo.run/v1alpha1',
                kind: 'Snapshot',
                metadata: {
                    generateName: 'snapshot-'
                }
            };

            // 发布文章
            const result = await this.haloClient.publishPost(postData);

            return {
                content: [
                    {
                        type: "text",
                        text: `文章发布成功！
标题: ${title}
别名: ${postSlug}
标签: ${tags.join(', ')}
分类: ${categories.join(', ')}
文章ID: ${result.metadata.name}
访问地址: ${this.config.baseUrl}/archives/${postSlug}`
                    }
                ]
            };

        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `发布文章失败: ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }

    async handleListTags() {
        try {
            const tags = await this.haloClient.getTags();
            const tagList = tags.items.map(tag => ({
                name: tag.metadata.name,
                displayName: tag.spec.displayName,
                slug: tag.spec.slug
            }));

            return {
                content: [
                    {
                        type: "text",
                        text: `标签列表 (共${tagList.length}个):\n${tagList.map(tag => `- ${tag.displayName} (${tag.slug})`).join('\n')}`
                    }
                ]
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `获取标签列表失败: ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }

    async handleListCategories() {
        try {
            const categories = await this.haloClient.getCategories();
            const categoryList = categories.items.map(cat => ({
                name: cat.metadata.name,
                displayName: cat.spec.displayName,
                slug: cat.spec.slug,
                description: cat.spec.description
            }));

            return {
                content: [
                    {
                        type: "text",
                        text: `分类列表 (共${categoryList.length}个):\n${categoryList.map(cat => `- ${cat.displayName} (${cat.slug}): ${cat.description || '无描述'}`).join('\n')}`
                    }
                ]
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `获取分类列表失败: ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("Halo MCP服务已启动");
    }
}

// 启动服务器
const server = new HaloMCPServer();
server.run().catch(console.error);
